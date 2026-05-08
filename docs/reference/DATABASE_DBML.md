// Tài khoản người dùng chính và định danh đa kênh
Table users {
  uid int [pk, increment]
  identifier varchar [unique]
  uname varchar [unique]
  email varchar [unique]

  telegram_id varchar [unique, null]
  zalo_id varchar [unique, null]
  discord_id varchar [unique, null]
  slack_id varchar [unique, null]
  facebook_id varchar [unique, null]

  ggauth_token varchar [unique, null]
  password varchar
  active_email boolean
  use_ggauth boolean

  level enum('owner', 'colleague', 'client')
  status enum('active', 'block')

  created_at timestamp
  update_at timestamp
}

// Mã xác thực / OTP cho email login, reset password và các flow bảo mật
Table user_codes {
  uc_id int [pk, increment]
  uc_value varchar
  uc_type enum('active-email', 'login', 'reset-password', 'advanced')
  uc_place enum('email', 'telegram', 'zalo', 'discord') [null]
  uc_expired_time timestamp
  uc_life boolean
  uc_user_id int [ref: > users.uid]

  created_at timestamp
  update_at timestamp

  Indexes {
    (uc_user_id, uc_type, uc_life)
  }
}

// Cấu hình bot / token theo từng user
Table bot_users {
  bu_id int [pk, increment]
  bu_uid int [unique, ref: > users.uid]

  bu_telegram_bot_token varchar [null]
  bu_discord_bot_token varchar [null]
  bu_slack_bot_token varchar [null]
  bu_zalo_bot_token varchar [null]
  bu_google_console_cloud_json_path varchar [null]

  created_at timestamp
  update_at timestamp
}

// Cấp quyền truy cập bot cho user bên ngoài theo từng nền tảng
Table bot_access_grants {
  grant_id int [pk, increment]
  bu_id int [ref: > bot_users.bu_id]

  platform enum('telegram', 'discord', 'slack', 'zalo')
  platform_user_id varchar

  granted_by int [ref: > users.uid]
  verification_code varchar [null]
  is_verified boolean

  created_at timestamp
}

// Phiên hội thoại chuẩn hóa theo kênh
Table chat_threads {
  thread_id uuid [pk]
  uid int [ref: > users.uid]

  platform enum('web', 'telegram', 'zalo', 'discord', 'slack', 'facebook')

  telegram_id varchar [null]
  zalo_id varchar [null]
  discord_id varchar [null]

  title text [null]
  is_active boolean

  status enum('life', 'delete') [default: 'life']

  active_openclaw_oa_id int [null]

  created_at timestamp
  updated_at timestamp
}

// Tin nhắn trong từng thread
Table chat_messages {
  msg_id uuid [pk]
  thread_id uuid [ref: > chat_threads.thread_id]
  uid int [ref: > users.uid]

  telegram_id varchar [null]
  zalo_id varchar [null]
  discord_id varchar [null]

  role enum('system', 'user', 'assistant', 'tool')
  content text

  tokens_used int
  is_vectorized boolean
  is_exported boolean

  created_at timestamp

  Indexes {
    (thread_id, created_at)
    (is_vectorized)
  }
}

// Bộ nhớ RAG
Table memory_rags {
  mr_id int [pk, increment]
  mr_user_id int [ref: > users.uid]

  mr_name varchar
  mr_code varchar [unique]
  mr_type enum('json', 'text') [default: 'text']
  mr_value text [null]
  mr_status enum('active', 'inactive') [default: 'active']

  create_at timestamp
  update_at timestamp
}

// Danh sách OpenClaw agent được kết nối cho từng user
Table openclaw_agents {
  oa_id int [pk, increment]
  oa_name varchar
  oa_uid int [ref: > users.uid]

  oa_domain varchar
  oa_port varchar
  oa_use_tls boolean

  oa_chat_path varchar [null]
  oa_token_gateway varchar [null]
  oa_password_gateway varchar [null]
  oa_expertise text [null]

  oa_status enum('active', 'disabled')
  oa_last_health_at timestamp [null]
  oa_last_error text [null]

  created_at timestamp
  updated_at timestamp
}

// Mapping session OpenClaw với thread nội bộ
Table openclaw_threads {
  oct_id uuid [pk]
  uid int [ref: > users.uid]
  oa_id int [ref: > openclaw_agents.oa_id]

  chat_thread_id uuid [ref: > chat_threads.thread_id, null]
  openclaw_session_key varchar [null]

  platform enum('web', 'telegram', 'zalo', 'discord', 'slack', 'facebook')
  telegram_id varchar [null]
  zalo_id varchar [null]
  discord_id varchar [null]
  title text [null]

  created_at timestamp
  updated_at timestamp

  Indexes {
    (uid, oa_id)
    (chat_thread_id)
  }
}

// Lịch sử message trao đổi thông qua OpenClaw
Table openclaw_messages {
  ocm_id uuid [pk]
  oct_id uuid [ref: > openclaw_threads.oct_id]
  uid int [ref: > users.uid]

  role enum('system', 'user', 'assistant', 'tool')
  content text

  oa_display_name varchar [null]
  extra jsonb [null]

  created_at timestamp

  Indexes {
    (oct_id, created_at)
  }
}

// Scheduled tasks - Agent
Table scheduled_tasks_agent {
  task_id int [pk, increment]
  uid int [ref: > users.uid]

  task_code varchar [unique]
  name varchar
  description text [null]
  cron_expression varchar

  agent_prompt text [null]
  allowed_skills json [null]

  source enum('heartbeat', 'agent', 'manual')
  status enum('active', 'paused', 'disabled')

  max_retries int
  consecutive_failures int
  total_failures int
  total_successes int
  auto_pause_on_max_retries boolean

  max_tokens_per_run int
  max_model_tier varchar [null]
  timeout_ms int

  last_run_at timestamp [null]
  last_success_at timestamp [null]
  last_error text [null]
  next_run_at timestamp [null]

  created_at timestamp
  updated_at timestamp
}

// Scheduled tasks - n8n
Table scheduled_tasks_n8n {
  task_id int [pk, increment]
  uid int [ref: > users.uid]

  task_code varchar [unique]
  name varchar
  description text [null]
  cron_expression varchar

  n8n_workflow_key varchar(120) [null]
  n8n_payload jsonb [null]
  notify_channel_id varchar(20) [null]
  notify_target_id varchar(180) [null]

  source enum('heartbeat', 'agent', 'manual')
  status enum('active', 'paused', 'disabled')

  max_retries int
  consecutive_failures int
  total_failures int
  total_successes int
  auto_pause_on_max_retries boolean

  max_tokens_per_run int
  max_model_tier varchar [null]
  timeout_ms int

  last_run_at timestamp [null]
  last_success_at timestamp [null]
  last_error text [null]
  next_run_at timestamp [null]

  created_at timestamp
  updated_at timestamp
}

// Scheduled tasks - Workflow
Table scheduled_tasks_workflow {
  task_id int [pk, increment]
  uid int [ref: > users.uid]

  task_code varchar [unique]
  name varchar
  description text [null]
  cron_expression varchar

  workflow_id uuid [ref: > workflows.id]
  workflow_set_payload boolean [default: false]
  stw_schedule_session uuid

  source enum('heartbeat', 'agent', 'manual')
  status enum('active', 'paused', 'disabled')

  max_retries int
  consecutive_failures int
  total_failures int
  total_successes int
  auto_pause_on_max_retries boolean

  max_tokens_per_run int
  max_model_tier varchar [null]
  timeout_ms int

  last_run_at timestamp [null]
  last_success_at timestamp [null]
  last_error text [null]
  next_run_at timestamp [null]

  created_at timestamp
  updated_at timestamp
}

// Cấu hình input payload cho task workflow (khi workflow_set_payload = true).
Table scheduled_payloads {
  sp_id int [pk, increment]
  sp_task_workflow int [ref: > scheduled_tasks_workflow.task_id]

  sp_key_name varchar
  sp_type enum('fixed', 'step', 'loop', 'random')
  sp_value text
  sp_step_cursor int [null]

  Indexes {
    (sp_task_workflow, sp_key_name) [unique]
  }
}

// Log lượt chạy theo phiên (ltw_session = scheduled_tasks_workflow.stw_schedule_session; session đổi khi activate từ disabled).
Table log_tasks_workflow {
  ltw_id int [pk, increment]
  ltw_task_workflow int [ref: > scheduled_tasks_workflow.task_id]

  ltw_session varchar
  ltw_turn_in_session int [default: 0]
  ltw_output jsonb [null]
  ltw_eror text [null]
}

// Nhật ký dispatch sang n8n và trạng thái callback
Table n8n_dispatches {
  id uuid [pk]
  user_id int
  thread_id uuid [null]

  workflow_key varchar(120)
  idempotency_key varchar(180)
  status enum('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'TIMED_OUT')

  dispatch_nonce varchar(40) [null]
  n8n_execution_id varchar(64) [null]

  notify_channel_id varchar(20) [null]
  notify_target_id varchar(180) [null]

  request_snapshot jsonb [null]
  result_preview text [null]
  error text [null]

  started_at timestamp [null]
  finished_at timestamp [null]
  created_at timestamp
  updated_at timestamp

  Indexes {
    (user_id, idempotency_key) [unique]
  }
}

// API keys dùng để gọi endpoint n8n integration theo user
Table n8n_api_keys {
  id uuid [pk]
  uid int [ref: > users.uid]

  label varchar(120)
  token_hash char(64) [unique]

  last_used_at timestamp [null]
  revoked_at timestamp [null]

  created_at timestamp
  updated_at timestamp

  Indexes {
    (token_hash) [unique]
    (uid, revoked_at)
  }
}

// Nhật ký mỗi pipeline run
Table agent_runs {
  run_id uuid [pk]
  uid int
  thread_id varchar(80)
  source_channel_id varchar(32)
  intent varchar(32) [null]
  tier varchar(32) [null]
  model varchar(120) [null]
  tokens_used int
  request_preview text [null]
  stage varchar(64) [null]
  error text [null]
  tool_calls jsonb [null]
  user_outcome enum('unknown', 'ok', 'bad')
  user_feedback_text text [null]
  user_feedback_at timestamp [null]
  created_at timestamp
  updated_at timestamp

  Indexes {
    (uid, created_at)
    (uid, thread_id, created_at)
    (uid, intent, created_at)
  }
}

// Chính sách chọn model / tier học từ feedback
Table model_policies {
  id uuid [pk]
  scope enum('global')
  signature varchar(120)
  intent varchar(32)
  primary_skill varchar(80) [null]
  preferred_tier varchar(32) [null]
  preferred_model varchar(120) [null]
  ok_count int
  bad_count int
  last_feedback_by_uid int [null]
  last_feedback_at timestamp [null]
  created_at timestamp
  updated_at timestamp

  Indexes {
    (scope, signature) [unique]
    (intent)
    (updated_at)
  }
}

// Catalog kỹ năng
Table skills_registry {
  skill_id int [pk, increment]
  skill_code varchar [unique]
  skill_name varchar
  display_name varchar [null]
  description text
  file_path varchar [null]
  parameters_schema json [null]

  category enum('web', 'runtime', 'browser', 'media', 'memory', 'messaging', 'sessions', 'filesystem', 'google_workspace', 'custom', 'clawhub')
  min_model_tier enum('cheap', 'skill', 'processor', 'expert')
  owner_only boolean
  is_active boolean
  is_display boolean
  skill_type varchar

  created_at timestamp
  updated_at timestamp
}

// Kho token HTTP cho outbound integrations
Table http_tokens {
  id int [pk, increment]
  code varchar(120) [unique]
  domain varchar(255)
  auth_type enum('api_key', 'bearer', 'basic')
  header_name varchar(128) [null]
  token text
  username varchar(255) [null]
  note text [null]

  created_by_uid int [ref: > users.uid, null]

  created_at timestamp
  updated_at timestamp
}

// Bộ nhớ sở thích người dùng
Table user_preferences {
  pref_id uuid [pk]
  uid int [ref: > users.uid]

  category varchar(64)
  pref_key varchar(255)
  pref_value text

  confidence float
  evidence_count int
  is_stable boolean
  last_seen_at timestamp

  created_at timestamp
  updated_at timestamp

  Indexes {
    (uid, confidence)
    (uid, category, pref_key) [unique]
  }
}

// Log bằng chứng thô để truy vết preference
Table user_preference_logs {
  pl_id uuid [pk]
  pref_id uuid [ref: > user_preferences.pref_id]
  uid int [ref: > users.uid]
  thread_id uuid [ref: > chat_threads.thread_id]

  evidence_type varchar(32)
  evidence_text text [null]

  created_at timestamp

  Indexes {
    (uid)
  }
}

// Định nghĩa workflow nghiệp vụ do user tạo
Table workflows {
  id uuid [pk]
  uid int [ref: > users.uid]
  code varchar(120) [unique]
  name varchar(180)
  description text [null]
  status enum('draft', 'active', 'paused', 'archived')
  entry_node_id uuid [null]
  version int
  input_payload jsonb [null]
  created_at timestamp
  updated_at timestamp
}

// Các node xử lý của workflow
Table workflow_nodes {
  id uuid [pk]
  workflow_id uuid [ref: > workflows.id]
  name varchar(160)
  prompt_template text [null]
  tool_code varchar(120) [null]
  command_code text [null]
  model_override varchar(160) [null]
  max_attempts int
  timeout_ms int
  output_schema jsonb [null]
  join_mode enum('none', 'wait_any', 'wait_all')
  join_expected int [null]
  pos_x int
  pos_y int
  created_at timestamp
  updated_at timestamp

  Indexes {
    (workflow_id, name) [unique]
  }
}

// Cạnh điều hướng giữa các node
Table workflow_edges {
  id uuid [pk]
  workflow_id uuid [ref: > workflows.id]
  from_node_id uuid [ref: > workflow_nodes.id]
  to_node_id uuid [ref: > workflow_nodes.id]
  condition_expr text [null]
  priority int
  is_default boolean
  created_at timestamp
  updated_at timestamp

  Indexes {
    (workflow_id, from_node_id, priority)
  }
}

// Lịch sử mỗi lần chạy workflow
Table workflow_runs {
  id uuid [pk]
  workflow_id uuid [ref: > workflows.id]
  uid int [ref: > users.uid]
  input_payload jsonb [null]
  status enum('pending', 'running', 'succeeded', 'failed', 'cancelled')
  current_node_id uuid [null]
  final_output jsonb [null]
  error text [null]
  started_at timestamp [null]
  finished_at timestamp [null]
  created_at timestamp
}

// Nhật ký thực thi theo từng attempt của node
Table workflow_node_runs {
  id uuid [pk]
  workflow_run_id uuid [ref: > workflow_runs.id]
  node_id uuid [ref: > workflow_nodes.id]
  attempt_no int
  resolved_prompt text [null]
  resolved_command text [null]
  status enum('running', 'succeeded', 'failed')
  output jsonb [null]
  error text [null]
  duration_ms int
  created_at timestamp
}

// Cấu hình global của hệ thống
Table config {
  cof_id int [pk, increment]

  cof_brand_persona_md text [null]
  cof_openai_api_key varchar [null]
  cof_gemini_api_key varchar [null]
  cof_anthropic_api_key varchar [null]
  cof_openrouter_api_key varchar [null]
  cof_deepseek_api_key varchar [null]
  cof_kimi_api_key varchar [null]
  cof_zai_api_key varchar [null]
  cof_perplexity_api_key varchar [null]
  cof_brave_api_key varchar [null]
  cof_firecrawl_api_key varchar [null]
  cof_kie_api_key varchar [null]
  cof_openai_oauth jsonb [null]
  cof_deepgram_api_key varchar [null]
  cof_vnptai_api_key varchar [null]
  cof_vnptai_auth jsonb [null]

  cof_ollama jsonb [null]
  cof_lms jsonb [null]

  cof_scheduler_max_retries_per_tick int [null]
  cof_scheduler_max_consecutive_failed_ticks int [null]
  cof_scheduler_timezone varchar(64) [null]
}

// Cấu hình API key / OAuth / Ollama–LM Studio riêng từng user (một dòng tối đa mỗi user; ưu tiên khi resolve, sau đó fallback bảng `config`)
Table user_config {
  ucof_id int [pk, increment]
  ucof_user_id int [unique, ref: > users.uid]

  ucof_openai_api_key varchar [null]
  ucof_gemini_api_key varchar [null]
  ucof_anthropic_api_key varchar [null]
  ucof_openrouter_api_key varchar [null]
  ucof_deepseek_api_key varchar [null]
  ucof_kimi_api_key varchar [null]
  ucof_perplexity_api_key varchar [null]
  ucof_brave_api_key varchar [null]
  ucof_firecrawl_api_key varchar [null]
  ucof_kie_api_key varchar [null]
  ucof_openai_oauth jsonb [null]

  ucof_ollama jsonb [null]
  ucof_lms jsonb [null]
}