/**
 * CloudFormation Custom Resource Response Utilities
 *
 * Provides type-safe helpers for CloudFormation Custom Resource responses.
 */

import type {
  CloudFormationCustomResourceEvent,
  CloudFormationCustomResourceResponse,
  CloudFormationCustomResourceSuccessResponse,
  CloudFormationCustomResourceFailedResponse,
} from 'aws-lambda';

export type CfnEvent = CloudFormationCustomResourceEvent;
export type CfnResponse = CloudFormationCustomResourceResponse;

/**
 * Build a successful CloudFormation response
 */
export function success(
  physicalResourceId: string,
  data?: Record<string, string>
): CloudFormationCustomResourceSuccessResponse {
  return {
    Status: 'SUCCESS',
    PhysicalResourceId: physicalResourceId,
    Data: data,
  } as CloudFormationCustomResourceSuccessResponse;
}

/**
 * Build a failed CloudFormation response
 */
export function failure(
  physicalResourceId: string,
  reason: string
): CloudFormationCustomResourceFailedResponse {
  return {
    Status: 'FAILED',
    PhysicalResourceId: physicalResourceId,
    Reason: reason,
  } as CloudFormationCustomResourceFailedResponse;
}

/**
 * Extract properties from CloudFormation event with type safety
 */
export function extractProperties<T extends Record<string, unknown>>(
  event: CfnEvent
): T {
  return event.ResourceProperties as T;
}

/**
 * Get old properties for Update events
 */
export function extractOldProperties<T extends Record<string, unknown>>(
  event: CfnEvent
): T | undefined {
  if (event.RequestType === 'Update') {
    return (event as CloudFormationCustomResourceEvent & { OldResourceProperties?: T })
      .OldResourceProperties;
  }
  return undefined;
}
