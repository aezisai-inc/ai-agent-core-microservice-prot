import * as cdk from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import { Construct } from 'constructs';

/**
 * AgentCore Observability Dashboard Stack
 * 
 * CloudWatch Dashboardを構築し、以下のKPIを可視化:
 * - エピソード検出率 (>80%)
 * - 類似エピソード活用率 (>60%)
 * - Reflection生成数 (>10/週)
 * - 応答品質向上 (+15%)
 * - 同一エラー再発率 (-30%)
 */
export class DashboardStack extends cdk.Stack {
  public readonly dashboard: cloudwatch.Dashboard;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const environment = this.node.tryGetContext('environment') || 'development';
    const namespace = 'AgentCore';

    // Main Dashboard
    this.dashboard = new cloudwatch.Dashboard(this, 'AgentCoreDashboard', {
      dashboardName: `AgentCore-${environment}`,
    });

    // ===================
    // Agent Performance Section
    // ===================
    this.dashboard.addWidgets(
      new cloudwatch.TextWidget({
        markdown: '# 🤖 Agent Performance',
        width: 24,
        height: 1,
      })
    );

    this.dashboard.addWidgets(
      // Invocation Metrics
      new cloudwatch.GraphWidget({
        title: 'Agent Invocations',
        width: 8,
        height: 6,
        left: [
          new cloudwatch.Metric({
            namespace,
            metricName: 'InvocationCount',
            statistic: 'Sum',
            period: cdk.Duration.minutes(5),
          }),
          new cloudwatch.Metric({
            namespace,
            metricName: 'SuccessCount',
            statistic: 'Sum',
            period: cdk.Duration.minutes(5),
          }),
          new cloudwatch.Metric({
            namespace,
            metricName: 'ErrorCount',
            statistic: 'Sum',
            period: cdk.Duration.minutes(5),
          }),
        ],
      }),

      // Latency Metrics
      new cloudwatch.GraphWidget({
        title: 'Latency (ms)',
        width: 8,
        height: 6,
        left: [
          new cloudwatch.Metric({
            namespace,
            metricName: 'TotalLatency',
            statistic: 'Average',
            period: cdk.Duration.minutes(5),
          }),
          new cloudwatch.Metric({
            namespace,
            metricName: 'LLMLatency',
            statistic: 'Average',
            period: cdk.Duration.minutes(5),
          }),
          new cloudwatch.Metric({
            namespace,
            metricName: 'MemoryLatency',
            statistic: 'Average',
            period: cdk.Duration.minutes(5),
          }),
        ],
      }),

      // Token Usage
      new cloudwatch.GraphWidget({
        title: 'Token Usage',
        width: 8,
        height: 6,
        left: [
          new cloudwatch.Metric({
            namespace,
            metricName: 'InputTokens',
            statistic: 'Sum',
            period: cdk.Duration.minutes(5),
          }),
          new cloudwatch.Metric({
            namespace,
            metricName: 'OutputTokens',
            statistic: 'Sum',
            period: cdk.Duration.minutes(5),
          }),
        ],
        stacked: true,
      })
    );

    // ===================
    // Episode Memory KPIs Section
    // ===================
    this.dashboard.addWidgets(
      new cloudwatch.TextWidget({
        markdown: '# 📚 Episode Memory KPIs',
        width: 24,
        height: 1,
      })
    );

    this.dashboard.addWidgets(
      // Episode Detection Rate (KPI: >80%)
      new cloudwatch.GaugeWidget({
        title: 'Episode Detection Rate (Target: >80%)',
        width: 8,
        height: 6,
        metrics: [
          new cloudwatch.Metric({
            namespace,
            metricName: 'EpisodeDetectionRate',
            statistic: 'Average',
            period: cdk.Duration.hours(1),
          }),
        ],
        leftYAxis: {
          min: 0,
          max: 100,
        },
        annotations: [
          {
            value: 80,
            color: '#2ca02c',
            label: 'Target',
          },
        ],
      }),

      // Context Utilization Rate (KPI: >60%)
      new cloudwatch.GaugeWidget({
        title: 'Context Utilization (Target: >60%)',
        width: 8,
        height: 6,
        metrics: [
          new cloudwatch.Metric({
            namespace,
            metricName: 'ContextUtilizationRate',
            statistic: 'Average',
            period: cdk.Duration.hours(1),
          }),
        ],
        leftYAxis: {
          min: 0,
          max: 100,
        },
        annotations: [
          {
            value: 60,
            color: '#2ca02c',
            label: 'Target',
          },
        ],
      }),

      // Episode Statistics
      new cloudwatch.GraphWidget({
        title: 'Episode Operations',
        width: 8,
        height: 6,
        left: [
          new cloudwatch.Metric({
            namespace,
            metricName: 'InteractionCount',
            statistic: 'Sum',
            period: cdk.Duration.minutes(5),
          }),
          new cloudwatch.Metric({
            namespace,
            metricName: 'EpisodeDetectedCount',
            statistic: 'Sum',
            period: cdk.Duration.minutes(5),
          }),
        ],
      })
    );

    // ===================
    // Reflections KPIs Section
    // ===================
    this.dashboard.addWidgets(
      new cloudwatch.TextWidget({
        markdown: '# 💡 Reflections KPIs',
        width: 24,
        height: 1,
      })
    );

    this.dashboard.addWidgets(
      // Reflection Generation (KPI: >10/week)
      new cloudwatch.SingleValueWidget({
        title: 'Reflections Generated (Weekly, Target: >10)',
        width: 8,
        height: 4,
        metrics: [
          new cloudwatch.Metric({
            namespace,
            metricName: 'ReflectionsGenerated',
            statistic: 'Sum',
            period: cdk.Duration.days(7),
          }),
        ],
      }),

      // Quality Improvement (KPI: +15%)
      new cloudwatch.GaugeWidget({
        title: 'Quality Improvement (Target: +15%)',
        width: 8,
        height: 6,
        metrics: [
          new cloudwatch.Metric({
            namespace,
            metricName: 'QualityImprovementRate',
            statistic: 'Average',
            period: cdk.Duration.hours(1),
          }),
        ],
        leftYAxis: {
          min: -50,
          max: 50,
        },
        annotations: [
          {
            value: 15,
            color: '#2ca02c',
            label: 'Target',
          },
        ],
      }),

      // Error Repeat Rate (KPI: -30%)
      new cloudwatch.GaugeWidget({
        title: 'Error Repeat Rate (Target: <70%)',
        width: 8,
        height: 6,
        metrics: [
          new cloudwatch.Metric({
            namespace,
            metricName: 'ErrorRepeatRate',
            statistic: 'Average',
            period: cdk.Duration.hours(1),
          }),
        ],
        leftYAxis: {
          min: 0,
          max: 100,
        },
        annotations: [
          {
            value: 70,
            color: '#2ca02c',
            label: 'Target (30% reduction)',
          },
        ],
      })
    );

    this.dashboard.addWidgets(
      // Pattern Application
      new cloudwatch.GraphWidget({
        title: 'Pattern Application',
        width: 12,
        height: 6,
        left: [
          new cloudwatch.Metric({
            namespace,
            metricName: 'SuccessPatternsApplied',
            statistic: 'Sum',
            period: cdk.Duration.hours(1),
          }),
          new cloudwatch.Metric({
            namespace,
            metricName: 'FailurePatternsAvoided',
            statistic: 'Sum',
            period: cdk.Duration.hours(1),
          }),
        ],
      }),

      // Reflection Usage
      new cloudwatch.GraphWidget({
        title: 'Reflection Usage',
        width: 12,
        height: 6,
        left: [
          new cloudwatch.Metric({
            namespace,
            metricName: 'ReflectionsGenerated',
            statistic: 'Sum',
            period: cdk.Duration.hours(1),
          }),
          new cloudwatch.Metric({
            namespace,
            metricName: 'ReflectionsApplied',
            statistic: 'Sum',
            period: cdk.Duration.hours(1),
          }),
        ],
      })
    );

    // ===================
    // Session Management Section
    // ===================
    this.dashboard.addWidgets(
      new cloudwatch.TextWidget({
        markdown: '# 💬 Session Management',
        width: 24,
        height: 1,
      })
    );

    this.dashboard.addWidgets(
      // Active Sessions
      new cloudwatch.SingleValueWidget({
        title: 'Active Sessions',
        width: 6,
        height: 4,
        metrics: [
          new cloudwatch.Metric({
            namespace,
            metricName: 'ActiveSessions',
            statistic: 'Maximum',
            period: cdk.Duration.minutes(5),
          }),
        ],
      }),

      // Session Lifecycle
      new cloudwatch.GraphWidget({
        title: 'Session Lifecycle',
        width: 9,
        height: 6,
        left: [
          new cloudwatch.Metric({
            namespace,
            metricName: 'TotalSessionsCreated',
            statistic: 'Sum',
            period: cdk.Duration.hours(1),
          }),
          new cloudwatch.Metric({
            namespace,
            metricName: 'SessionsExpired',
            statistic: 'Sum',
            period: cdk.Duration.hours(1),
          }),
        ],
      }),

      // Messages
      new cloudwatch.GraphWidget({
        title: 'Message Volume',
        width: 9,
        height: 6,
        left: [
          new cloudwatch.Metric({
            namespace,
            metricName: 'TotalMessages',
            statistic: 'Sum',
            period: cdk.Duration.hours(1),
          }),
        ],
      })
    );

    // ===================
    // Knowledge Base Section
    // ===================
    this.dashboard.addWidgets(
      new cloudwatch.TextWidget({
        markdown: '# 🔍 Knowledge Base',
        width: 24,
        height: 1,
      })
    );

    this.dashboard.addWidgets(
      // Query Metrics
      new cloudwatch.GraphWidget({
        title: 'Knowledge Queries',
        width: 8,
        height: 6,
        left: [
          new cloudwatch.Metric({
            namespace,
            metricName: 'KnowledgeQueryCount',
            statistic: 'Sum',
            period: cdk.Duration.minutes(5),
          }),
        ],
      }),

      // Query Latency
      new cloudwatch.GraphWidget({
        title: 'Knowledge Query Latency',
        width: 8,
        height: 6,
        left: [
          new cloudwatch.Metric({
            namespace,
            metricName: 'KnowledgeQueryLatency',
            statistic: 'Average',
            period: cdk.Duration.minutes(5),
          }),
          new cloudwatch.Metric({
            namespace,
            metricName: 'KnowledgeQueryLatency',
            statistic: 'p99',
            period: cdk.Duration.minutes(5),
          }),
        ],
      }),

      // Cache Performance
      new cloudwatch.GraphWidget({
        title: 'Cache Performance',
        width: 8,
        height: 6,
        left: [
          new cloudwatch.Metric({
            namespace,
            metricName: 'KnowledgeCacheHit',
            statistic: 'Sum',
            period: cdk.Duration.minutes(5),
          }),
        ],
      })
    );

    // ===================
    // Alarms
    // ===================
    
    // High Error Rate Alarm
    new cloudwatch.Alarm(this, 'HighErrorRateAlarm', {
      alarmName: `AgentCore-${environment}-HighErrorRate`,
      alarmDescription: 'Agent error rate is above threshold',
      metric: new cloudwatch.MathExpression({
        expression: 'errors / invocations * 100',
        usingMetrics: {
          errors: new cloudwatch.Metric({
            namespace,
            metricName: 'ErrorCount',
            statistic: 'Sum',
            period: cdk.Duration.minutes(5),
          }),
          invocations: new cloudwatch.Metric({
            namespace,
            metricName: 'InvocationCount',
            statistic: 'Sum',
            period: cdk.Duration.minutes(5),
          }),
        },
      }),
      threshold: 10,
      evaluationPeriods: 3,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
    });

    // Low Episode Detection Rate Alarm
    new cloudwatch.Alarm(this, 'LowEpisodeDetectionAlarm', {
      alarmName: `AgentCore-${environment}-LowEpisodeDetection`,
      alarmDescription: 'Episode detection rate is below KPI target (80%)',
      metric: new cloudwatch.Metric({
        namespace,
        metricName: 'EpisodeDetectionRate',
        statistic: 'Average',
        period: cdk.Duration.hours(1),
      }),
      threshold: 80,
      evaluationPeriods: 3,
      comparisonOperator: cloudwatch.ComparisonOperator.LESS_THAN_THRESHOLD,
    });

    // High Latency Alarm
    new cloudwatch.Alarm(this, 'HighLatencyAlarm', {
      alarmName: `AgentCore-${environment}-HighLatency`,
      alarmDescription: 'Agent latency is above acceptable threshold',
      metric: new cloudwatch.Metric({
        namespace,
        metricName: 'TotalLatency',
        statistic: 'p99',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 30000, // 30 seconds
      evaluationPeriods: 3,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
    });

    // ===================
    // Outputs
    // ===================
    new cdk.CfnOutput(this, 'DashboardUrl', {
      value: `https://${this.region}.console.aws.amazon.com/cloudwatch/home?region=${this.region}#dashboards:name=AgentCore-${environment}`,
      description: 'CloudWatch Dashboard URL',
    });
  }
}
