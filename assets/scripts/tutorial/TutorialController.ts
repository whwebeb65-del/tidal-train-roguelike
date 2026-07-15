import { _decorator, Component } from 'cc';
const { ccclass } = _decorator;

export type TutorialStepId = 'lane' | 'combat' | 'reward' | 'route' | 'settlement';

export interface TutorialStep {
  readonly id: TutorialStepId;
  readonly message: string;
  readonly requiredAction: string;
}

@ccclass('TutorialController')
export class TutorialController extends Component {
  public readonly steps: readonly TutorialStep[] = [
    { id: 'lane', message: '左右变道躲开潮汐裂口', requiredAction: 'change-lane' },
    { id: 'combat', message: '列车会自动攻击，点击技能加速清场', requiredAction: 'combat' },
    { id: 'reward', message: '从三张潮汐卡中选择一张', requiredAction: 'choose-reward' },
    { id: 'route', message: '选择下一站，风险与奖励同时变化', requiredAction: 'choose-route' },
    { id: 'settlement', message: '结算后可以再次出发', requiredAction: 'settle' },
  ];

  private completed = new Set<TutorialStepId>();

  public complete(step: TutorialStepId): void {
    this.completed.add(step);
  }

  public isCompleted(step: TutorialStepId): boolean {
    return this.completed.has(step);
  }
}

