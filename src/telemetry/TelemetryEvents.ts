export type PrototypeEventName =
  | 'run_start'
  | 'first_action'
  | 'route_choice'
  | 'reward_choice'
  | 'synergy_activated'
  | 'boss_enter'
  | 'run_settled'
  | 'revive_clicked'
  | 'revive_result'
  | 'skill_refresh_clicked'
  | 'skill_refresh_result'
  | 'share_card_created'
  | 'legion_joined'
  | 'squad_changed'
  | 'squad_invite_shared'
  | 'expedition_contributed'
  | 'expedition_reward_claimed'
  | 'beta_application_result'
  | 'campaign_reward_claimed'
  | 'gift_code_redeem_result'
  | 'daily_trial_started'
  | 'daily_trial_submitted'
  | 'daily_trial_reward_claimed'
  | 'daily_trial_shared'
  | 'run_restart';

export interface PrototypeEvent {
  readonly name: PrototypeEventName;
  readonly runId: string;
  readonly timestampMs: number;
  readonly payload: Readonly<Record<string, string | number | boolean>>;
}
