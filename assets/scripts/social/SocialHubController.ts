import { _decorator, Component, EventTarget } from 'cc';
import type {
  ExpeditionMilestoneId,
  SupportId,
} from '../../../src/domain/social/SocialExpeditionSystem';

const { ccclass } = _decorator;

export interface SocialHubPorts {
  onLegionJoinRequested(): void;
  onSquadMemberToggleRequested(supportId: SupportId): void;
  onExpeditionMilestoneClaimRequested(milestoneId: ExpeditionMilestoneId): void;
  onSquadInviteRequested(): void;
}

@ccclass('SocialHubController')
export class SocialHubController extends Component implements SocialHubPorts {
  public readonly events = new EventTarget();

  public onLegionJoinRequested(): void {
    this.events.emit('legion-join-requested');
  }

  public onSquadMemberToggleRequested(supportId: SupportId): void {
    this.events.emit('squad-member-toggle-requested', supportId);
  }

  public onExpeditionMilestoneClaimRequested(milestoneId: ExpeditionMilestoneId): void {
    this.events.emit('expedition-milestone-claim-requested', milestoneId);
  }

  public onSquadInviteRequested(): void {
    this.events.emit('squad-invite-requested');
  }
}
