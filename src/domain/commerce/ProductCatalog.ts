export interface ProductReward {
  readonly gears: number;
  readonly routeMarks: number;
  readonly starTickets: number;
  readonly cosmeticIds: readonly string[];
}

export interface ProductDefinition {
  readonly id: string;
  readonly name: string;
  readonly displayPrice: string;
  readonly description: string;
  readonly oneTime: boolean;
  readonly reward: ProductReward;
}

export const PRODUCT_CATALOG: readonly ProductDefinition[] = [
  {
    id: 'starter-star-ticket-pack',
    name: '首航星票补给',
    displayPrice: '¥6',
    description: '固定获得 60 星票；仅可购买一次。',
    oneTime: true,
    reward: { gears: 0, routeMarks: 0, starTickets: 60, cosmeticIds: [] },
  },
  {
    id: 'abyssal-engine-cosmetic',
    name: '深海引擎涂装',
    displayPrice: '¥18',
    description: '固定获得非战力外观「深海引擎」；仅可购买一次。',
    oneTime: true,
    reward: { gears: 0, routeMarks: 0, starTickets: 0, cosmeticIds: ['deep-sea-engine'] },
  },
] as const;

export function getProductDefinition(productId: string): ProductDefinition | undefined {
  return PRODUCT_CATALOG.find((product) => product.id === productId);
}
