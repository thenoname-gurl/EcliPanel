export type ScheduleTrigger =
  | { type: 'cron'; schedule: string }
  | { type: 'power_action'; action: 'start' | 'stop' | 'restart' | 'kill' }
  | { type: 'server_state'; state: 'offline' | 'starting' | 'running' | 'stopping' }
  | { type: 'backup_status'; status: string }
  | { type: 'schedule_completion'; schedule: string; successful: boolean }
  | { type: 'resource_usage'; metric: 'cpu' | 'memory' | 'disk' | 'network_rx' | 'network_tx'; comparator: ScheduleConditionComparator; value: number; for_seconds?: number }
  | { type: 'resource_usage_over_time'; metric: 'cpu' | 'memory' | 'disk' | 'network_rx' | 'network_tx'; comparator: ScheduleConditionComparator; value: number; sustained_for_seconds: number; sample_interval_seconds?: number }
  | { type: 'console_line'; contains: string; case_insensitive?: boolean; output_into?: ScheduleVariable }
  | { type: 'crash' };

export type ScheduleConditionComparator = 'smaller_than' | 'smaller_than_or_equals' | 'equal' | 'greater_than' | 'greater_than_or_equals';

export type ScheduleCondition =
  | { type: 'none' }
  | { type: 'and'; conditions: ScheduleCondition[] }
  | { type: 'or'; conditions: ScheduleCondition[] }
  | { type: 'not'; condition: ScheduleCondition }
  | { type: 'xor'; conditions: ScheduleCondition[] }
  | { type: 'server_state'; state: string }
  | { type: 'uptime'; comparator: ScheduleConditionComparator; value: number }
  | { type: 'resource_usage'; metric: 'cpu' | 'memory' | 'disk' | 'network_rx' | 'network_tx'; comparator: ScheduleConditionComparator; value: number }
  | { type: 'backup_exists'; name_pattern?: string; backup_group_uuid?: string }
  | { type: 'backup_age'; name_pattern?: string; backup_group_uuid?: string; comparator: ScheduleConditionComparator; value_seconds: number }
  | { type: 'file_exists'; file: string }
  | { type: 'variable_exists'; variable: ScheduleVariable }
  | { type: 'variable_equals'; variable: ScheduleVariable; equals: ScheduleDynamicParameter }
  | { type: 'variable_contains'; variable: ScheduleVariable; contains: ScheduleDynamicParameter }
  | { type: 'variable_starts_with'; variable: ScheduleVariable; starts_with: ScheduleDynamicParameter }
  | { type: 'variable_ends_with'; variable: ScheduleVariable; ends_with: ScheduleDynamicParameter };

export interface ScheduleVariable {
  variable: string;
}

export type ScheduleDynamicParameter = string | ScheduleVariable;

export type ScheduleActionPayload =
  | { type: 'sleep'; duration: number }
  | { type: 'ensure'; condition: ScheduleCondition }
  | { type: 'if'; condition: ScheduleCondition }
  | { type: 'else_if'; condition: ScheduleCondition }
  | { type: 'else' }
  | { type: 'end_if' }
  | { type: 'exit'; successful: boolean }
  | { type: 'format'; format: string; output_into: ScheduleVariable }
  | { type: 'match_regex'; input: ScheduleDynamicParameter; regex: string; output_into: (ScheduleVariable | null)[] }
  | { type: 'wait_for_console_line'; ignore_failure?: boolean; contains: ScheduleDynamicParameter; case_insensitive?: boolean; timeout: number; output_into?: ScheduleVariable }
  | { type: 'wait_for_state'; ignore_failure?: boolean; state: string; timeout: number }
  | { type: 'send_power'; ignore_failure?: boolean; action: 'start' | 'stop' | 'restart' | 'kill' }
  | { type: 'send_command'; ignore_failure?: boolean; command: ScheduleDynamicParameter }
  | { type: 'create_backup'; ignore_failure?: boolean; foreground?: boolean; name?: ScheduleDynamicParameter; ignored_files?: string[]; backup_group_uuid?: string; compression_type?: string }
  | { type: 'restore_backup'; ignore_failure?: boolean; foreground?: boolean; backup_uuid?: string; backup_group_uuid?: string; selector?: 'latest' | 'oldest' | 'newest' }
  | { type: 'delete_backup'; ignore_failure?: boolean; backup_uuid?: string; backup_group_uuid?: string; selector?: 'latest' | 'oldest' | 'newest'; name_pattern?: string }
  | { type: 'move_backup'; ignore_failure?: boolean; backup_uuid?: string; backup_group_uuid?: string; destination_adapter?: string }
  | { type: 'export_backup'; ignore_failure?: boolean; backup_uuid?: string; backup_group_uuid?: string; path: ScheduleDynamicParameter; archive_format?: string }
  | { type: 'create_directory'; ignore_failure?: boolean; root: ScheduleDynamicParameter; name: ScheduleDynamicParameter }
  | { type: 'write_file'; ignore_failure?: boolean; append?: boolean; file: ScheduleDynamicParameter; content: ScheduleDynamicParameter }
  | { type: 'copy_file'; ignore_failure?: boolean; foreground?: boolean; file: ScheduleDynamicParameter; destination: ScheduleDynamicParameter }
  | { type: 'delete_files'; ignore_failure?: boolean; root: ScheduleDynamicParameter; files: string[] }
  | { type: 'rename_files'; ignore_failure?: boolean; root: ScheduleDynamicParameter; files: { from: string; to: string }[] }
  | { type: 'compress_files'; ignore_failure?: boolean; foreground?: boolean; root: ScheduleDynamicParameter; files: string[]; format: string; name: ScheduleDynamicParameter }
  | { type: 'decompress_file'; ignore_failure?: boolean; foreground?: boolean; root: ScheduleDynamicParameter; file: ScheduleDynamicParameter }
  | { type: 'update_startup_variable'; ignore_failure?: boolean; env_variable: ScheduleDynamicParameter; value: ScheduleDynamicParameter }
  | { type: 'update_startup_command'; ignore_failure?: boolean; command: ScheduleDynamicParameter }
  | { type: 'update_startup_docker_image'; ignore_failure?: boolean; image: ScheduleDynamicParameter };

export interface ScheduleAction {
  uuid: string;
  type: string;
  [key: string]: unknown;
}

export interface ScheduleRecord {
  uuid: string;
  name: string;
  is_active: boolean;
  triggers: ScheduleTrigger[];
  condition: ScheduleCondition;
  actions: ScheduleAction[];
  last_run_at: string | null;
  last_run_successful: boolean | null;
  last_run_errors: Record<string, string> | null;
  created_at: string;
}

export function toWingsSchedule(r: ScheduleRecord): Record<string, unknown> {
  return {
    uuid: r.uuid,
    triggers: r.triggers,
    condition: r.condition,
    actions: r.actions,
  };
}

export function buildWingsSchedules(records: ScheduleRecord[] | null | undefined): Record<string, unknown>[] {
  if (!records || !Array.isArray(records)) return [];
  return records.filter(r => r.is_active !== false).map(toWingsSchedule);
}