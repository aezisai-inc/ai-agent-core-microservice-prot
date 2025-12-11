/**
 * Bedrock Knowledge Base Custom Resource Handler
 *
 * Manages Bedrock Knowledge Base lifecycle through CloudFormation.
 * Creates KB, IAM Role, and Data Source as a single atomic unit.
 *
 * @see https://docs.aws.amazon.com/bedrock/latest/APIReference/
 */

import {
  BedrockAgentClient,
  CreateKnowledgeBaseCommand,
  GetKnowledgeBaseCommand,
  DeleteKnowledgeBaseCommand,
  ListKnowledgeBasesCommand,
  CreateDataSourceCommand,
  GetDataSourceCommand,
  DeleteDataSourceCommand,
  ListDataSourcesCommand,
  KnowledgeBase,
  DataSource,
} from '@aws-sdk/client-bedrock-agent';

import {
  IAMClient,
  CreateRoleCommand,
  DeleteRoleCommand,
  GetRoleCommand,
  PutRolePolicyCommand,
  DeleteRolePolicyCommand,
} from '@aws-sdk/client-iam';

import type { CloudFormationCustomResourceEvent, Context } from 'aws-lambda';
import {
  success,
  failure,
  waitForStatus,
  waitForDeletion,
  isResourceNotFoundException,
  sleep,
} from '../shared';
import type {
  KnowledgeBaseResourceProperties,
  KnowledgeBaseResponseData,
} from './types';

const REGION = process.env.AWS_REGION || 'ap-northeast-1';
const ACCOUNT_ID = process.env.AWS_ACCOUNT_ID || '';

const bedrockClient = new BedrockAgentClient({ region: REGION });
const iamClient = new IAMClient({ region: REGION });

/**
 * Lambda handler for CloudFormation Custom Resource
 */
export async function handler(
  event: CloudFormationCustomResourceEvent,
  _context: Context
): Promise<ReturnType<typeof success> | ReturnType<typeof failure>> {
  console.log('Event:', JSON.stringify(event, null, 2));

  const props = event.ResourceProperties as KnowledgeBaseResourceProperties;
  const physicalResourceId = event.PhysicalResourceId;

  try {
    switch (event.RequestType) {
      case 'Create':
        return await handleCreate(props);

      case 'Update':
        return await handleUpdate(physicalResourceId, props);

      case 'Delete':
        return await handleDelete(physicalResourceId, props);

      default:
        return failure(
          physicalResourceId || props.Name,
          `Unknown request type: ${event.RequestType}`
        );
    }
  } catch (error) {
    console.error('Handler error:', error);
    return failure(
      physicalResourceId || props.Name,
      error instanceof Error ? error.message : String(error)
    );
  }
}

/**
 * Handle Create request
 */
async function handleCreate(
  props: KnowledgeBaseResourceProperties
): Promise<ReturnType<typeof success>> {
  const kbName = props.Name;
  const roleName = `bedrock-kb-role-${props.Environment}`;

  // Idempotency check: find existing KB by name
  const existing = await findKnowledgeBaseByName(kbName);
  if (existing) {
    console.log(`Knowledge Base already exists: ${existing.knowledgeBaseId}`);

    // Get data source
    const dataSource = await findDataSourceByKbId(existing.knowledgeBaseId);

    return success(existing.knowledgeBaseId, {
      KnowledgeBaseId: existing.knowledgeBaseId,
      KnowledgeBaseArn: existing.knowledgeBaseArn ?? '',
      DataSourceId: dataSource?.dataSourceId ?? '',
      RoleArn: existing.roleArn,
      Status: existing.status,
    });
  }

  // Step 1: Create IAM Role
  console.log(`Creating IAM role: ${roleName}`);
  const roleArn = await createKnowledgeBaseRole(roleName, props);

  // Wait for IAM propagation
  console.log('Waiting for IAM propagation (10s)...');
  await sleep(10000);

  // Step 2: Create Knowledge Base
  console.log(`Creating Knowledge Base: ${kbName}`);
  const kb = await createKnowledgeBase(kbName, roleArn, props);

  // Wait for ACTIVE status
  const activeKb = await waitForKnowledgeBaseActive(kb.knowledgeBaseId);

  // Step 3: Create Data Source
  console.log(`Creating Data Source for KB: ${kb.knowledgeBaseId}`);
  const dataSource = await createDataSource(kb.knowledgeBaseId, props);

  return success(kb.knowledgeBaseId, {
    KnowledgeBaseId: kb.knowledgeBaseId,
    KnowledgeBaseArn: activeKb.knowledgeBaseArn ?? '',
    DataSourceId: dataSource.dataSourceId,
    RoleArn: roleArn,
    Status: activeKb.status,
  });
}

/**
 * Handle Update request
 */
async function handleUpdate(
  physicalResourceId: string,
  props: KnowledgeBaseResourceProperties
): Promise<ReturnType<typeof success>> {
  // Knowledge Base updates are limited - just return current state
  try {
    const response = await bedrockClient.send(
      new GetKnowledgeBaseCommand({
        knowledgeBaseId: physicalResourceId,
      })
    );

    const kb = response.knowledgeBase!;
    const dataSource = await findDataSourceByKbId(physicalResourceId);

    return success(physicalResourceId, {
      KnowledgeBaseId: kb.knowledgeBaseId!,
      KnowledgeBaseArn: kb.knowledgeBaseArn ?? '',
      DataSourceId: dataSource?.dataSourceId ?? '',
      RoleArn: kb.roleArn!,
      Status: kb.status!,
    });
  } catch (error) {
    if (isResourceNotFoundException(error)) {
      // Recreate if deleted externally
      return handleCreate(props);
    }
    throw error;
  }
}

/**
 * Handle Delete request
 */
async function handleDelete(
  physicalResourceId: string,
  props: KnowledgeBaseResourceProperties
): Promise<ReturnType<typeof success>> {
  if (!physicalResourceId || physicalResourceId === props.Name) {
    console.log('No physical resource ID, skipping delete');
    return success(props.Name, {
      KnowledgeBaseId: '',
      KnowledgeBaseArn: '',
      DataSourceId: '',
      RoleArn: '',
      Status: 'DELETED',
    });
  }

  try {
    // Step 1: Delete Data Sources
    const dataSources = await listDataSources(physicalResourceId);
    for (const ds of dataSources) {
      console.log(`Deleting Data Source: ${ds.dataSourceId}`);
      await bedrockClient.send(
        new DeleteDataSourceCommand({
          knowledgeBaseId: physicalResourceId,
          dataSourceId: ds.dataSourceId,
        })
      );
    }

    // Step 2: Delete Knowledge Base
    console.log(`Deleting Knowledge Base: ${physicalResourceId}`);
    await bedrockClient.send(
      new DeleteKnowledgeBaseCommand({
        knowledgeBaseId: physicalResourceId,
      })
    );

    // Wait for deletion
    await waitForDeletion(
      physicalResourceId,
      async (id) => {
        const response = await bedrockClient.send(
          new GetKnowledgeBaseCommand({ knowledgeBaseId: id })
        );
        return response.knowledgeBase!;
      },
      { timeoutSeconds: 300 }
    );

    // Step 3: Delete IAM Role
    const roleName = `bedrock-kb-role-${props.Environment}`;
    await deleteKnowledgeBaseRole(roleName);

    console.log(`Knowledge Base deleted: ${physicalResourceId}`);
  } catch (error) {
    if (!isResourceNotFoundException(error)) {
      throw error;
    }
    console.log(`Knowledge Base already deleted: ${physicalResourceId}`);
  }

  return success(physicalResourceId, {
    KnowledgeBaseId: physicalResourceId,
    KnowledgeBaseArn: '',
    DataSourceId: '',
    RoleArn: '',
    Status: 'DELETED',
  });
}

/**
 * Create IAM role for Knowledge Base
 */
async function createKnowledgeBaseRole(
  roleName: string,
  props: KnowledgeBaseResourceProperties
): Promise<string> {
  // Check if role exists
  try {
    const response = await iamClient.send(new GetRoleCommand({ RoleName: roleName }));
    console.log(`IAM role already exists: ${roleName}`);
    return response.Role!.Arn!;
  } catch (error) {
    if (!isResourceNotFoundException(error)) {
      throw error;
    }
  }

  // Trust policy for Bedrock
  const trustPolicy = {
    Version: '2012-10-17',
    Statement: [
      {
        Effect: 'Allow',
        Principal: {
          Service: 'bedrock.amazonaws.com',
        },
        Action: 'sts:AssumeRole',
        Condition: {
          StringEquals: {
            'aws:SourceAccount': ACCOUNT_ID,
          },
        },
      },
    ],
  };

  // Create role
  const createResponse = await iamClient.send(
    new CreateRoleCommand({
      RoleName: roleName,
      AssumeRolePolicyDocument: JSON.stringify(trustPolicy),
      Description: `IAM role for Bedrock Knowledge Base (${props.Environment})`,
    })
  );

  const roleArn = createResponse.Role!.Arn!;

  // Attach S3 access policy
  const s3Policy = {
    Version: '2012-10-17',
    Statement: [
      {
        Effect: 'Allow',
        Action: ['s3:GetObject', 's3:ListBucket'],
        Resource: [
          props.DocumentsBucketArn,
          `${props.DocumentsBucketArn}/*`,
          ...(props.VectorBucketArn
            ? [props.VectorBucketArn, `${props.VectorBucketArn}/*`]
            : []),
        ],
      },
    ],
  };

  await iamClient.send(
    new PutRolePolicyCommand({
      RoleName: roleName,
      PolicyName: 'S3Access',
      PolicyDocument: JSON.stringify(s3Policy),
    })
  );

  // Attach Bedrock access policy
  const bedrockPolicy = {
    Version: '2012-10-17',
    Statement: [
      {
        Effect: 'Allow',
        Action: ['bedrock:InvokeModel'],
        Resource: [`arn:aws:bedrock:${REGION}::foundation-model/*`],
      },
    ],
  };

  await iamClient.send(
    new PutRolePolicyCommand({
      RoleName: roleName,
      PolicyName: 'BedrockAccess',
      PolicyDocument: JSON.stringify(bedrockPolicy),
    })
  );

  console.log(`IAM role created: ${roleArn}`);
  return roleArn;
}

/**
 * Delete IAM role for Knowledge Base
 */
async function deleteKnowledgeBaseRole(roleName: string): Promise<void> {
  try {
    // Delete inline policies
    for (const policyName of ['S3Access', 'BedrockAccess']) {
      try {
        await iamClient.send(
          new DeleteRolePolicyCommand({
            RoleName: roleName,
            PolicyName: policyName,
          })
        );
      } catch {
        // Ignore if policy doesn't exist
      }
    }

    // Delete role
    await iamClient.send(new DeleteRoleCommand({ RoleName: roleName }));
    console.log(`IAM role deleted: ${roleName}`);
  } catch (error) {
    if (!isResourceNotFoundException(error)) {
      throw error;
    }
    console.log(`IAM role already deleted: ${roleName}`);
  }
}

/**
 * Create Knowledge Base
 */
async function createKnowledgeBase(
  name: string,
  roleArn: string,
  props: KnowledgeBaseResourceProperties
): Promise<KnowledgeBase> {
  const response = await bedrockClient.send(
    new CreateKnowledgeBaseCommand({
      name,
      description: `Knowledge Base for ${props.Environment} - Managed by CDK`,
      roleArn,
      knowledgeBaseConfiguration: {
        type: 'VECTOR',
        vectorKnowledgeBaseConfiguration: {
          embeddingModelArn: props.EmbeddingModelArn,
        },
      },
      storageConfiguration:
        props.StorageType === 'S3_VECTORS'
          ? {
              type: 'S3',
              s3Configuration: {
                bucketArn: props.VectorBucketArn!,
              },
            }
          : {
              type: 'OPENSEARCH_SERVERLESS',
              opensearchServerlessConfiguration: {
                collectionArn: '', // Will be auto-created
                vectorIndexName: 'bedrock-knowledge-base-index',
                fieldMapping: {
                  vectorField: 'embedding',
                  textField: 'text',
                  metadataField: 'metadata',
                },
              },
            },
    })
  );

  return response.knowledgeBase!;
}

/**
 * Create Data Source for Knowledge Base
 */
async function createDataSource(
  knowledgeBaseId: string,
  props: KnowledgeBaseResourceProperties
): Promise<DataSource> {
  const dsName = `s3-documents-${props.Environment}`;

  // Check if exists
  const existing = await findDataSourceByName(knowledgeBaseId, dsName);
  if (existing) {
    console.log(`Data Source already exists: ${existing.dataSourceId}`);
    return existing;
  }

  const response = await bedrockClient.send(
    new CreateDataSourceCommand({
      knowledgeBaseId,
      name: dsName,
      description: `S3 documents data source - Managed by CDK`,
      dataSourceConfiguration: {
        type: 'S3',
        s3Configuration: {
          bucketArn: props.DocumentsBucketArn,
          inclusionPrefixes: [props.DocumentsPrefix],
        },
      },
    })
  );

  return response.dataSource!;
}

/**
 * Wait for Knowledge Base to become ACTIVE
 */
async function waitForKnowledgeBaseActive(
  knowledgeBaseId: string
): Promise<KnowledgeBase> {
  return waitForStatus<KnowledgeBase>(
    knowledgeBaseId,
    'ACTIVE',
    async (id) => {
      const response = await bedrockClient.send(
        new GetKnowledgeBaseCommand({ knowledgeBaseId: id })
      );
      return response.knowledgeBase!;
    },
    { timeoutSeconds: 300, intervalSeconds: 10 }
  );
}

/**
 * Find Knowledge Base by name
 */
async function findKnowledgeBaseByName(
  name: string
): Promise<KnowledgeBase | undefined> {
  const response = await bedrockClient.send(new ListKnowledgeBasesCommand({}));
  const summary = response.knowledgeBaseSummaries?.find((kb) => kb.name === name);

  if (!summary) return undefined;

  const getResponse = await bedrockClient.send(
    new GetKnowledgeBaseCommand({ knowledgeBaseId: summary.knowledgeBaseId })
  );
  return getResponse.knowledgeBase;
}

/**
 * Find Data Source by KB ID
 */
async function findDataSourceByKbId(
  knowledgeBaseId: string
): Promise<DataSource | undefined> {
  const response = await bedrockClient.send(
    new ListDataSourcesCommand({ knowledgeBaseId })
  );
  const summary = response.dataSourceSummaries?.[0];

  if (!summary) return undefined;

  const getResponse = await bedrockClient.send(
    new GetDataSourceCommand({
      knowledgeBaseId,
      dataSourceId: summary.dataSourceId,
    })
  );
  return getResponse.dataSource;
}

/**
 * Find Data Source by name
 */
async function findDataSourceByName(
  knowledgeBaseId: string,
  name: string
): Promise<DataSource | undefined> {
  const response = await bedrockClient.send(
    new ListDataSourcesCommand({ knowledgeBaseId })
  );
  const summary = response.dataSourceSummaries?.find((ds) => ds.name === name);

  if (!summary) return undefined;

  const getResponse = await bedrockClient.send(
    new GetDataSourceCommand({
      knowledgeBaseId,
      dataSourceId: summary.dataSourceId,
    })
  );
  return getResponse.dataSource;
}

/**
 * List all Data Sources for a Knowledge Base
 */
async function listDataSources(knowledgeBaseId: string): Promise<DataSource[]> {
  const response = await bedrockClient.send(
    new ListDataSourcesCommand({ knowledgeBaseId })
  );

  const dataSources: DataSource[] = [];
  for (const summary of response.dataSourceSummaries ?? []) {
    const getResponse = await bedrockClient.send(
      new GetDataSourceCommand({
        knowledgeBaseId,
        dataSourceId: summary.dataSourceId,
      })
    );
    if (getResponse.dataSource) {
      dataSources.push(getResponse.dataSource);
    }
  }

  return dataSources;
}
