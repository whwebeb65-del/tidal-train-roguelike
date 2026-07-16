export interface ProductReward {
  readonly gears: number;
  readonly routeMarks: number;
  readonly starTickets: number;
  readonly cosmeticIds: readonly string[];
  readonly skinIds: readonly string[];
  readonly equipmentDefinitionIds: readonly string[];
  readonly equipmentFragments: Readonly<Record<string, number>>;
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
    reward: {
      gears: 0,
      routeMarks: 0,
      starTickets: 60,
      cosmeticIds: [],
      skinIds: [],
      equipmentDefinitionIds: [],
      equipmentFragments: {},
    },
  },
  {
    id: 'abyssal-engine-cosmetic',
    name: '深海引擎涂装',
    displayPrice: '¥18',
    description: '固定获得非战力外观「深海引擎」；仅可购买一次。',
    oneTime: true,
    reward: {
      gears: 0,
      routeMarks: 0,
      starTickets: 0,
      cosmeticIds: ['deep-sea-engine'],
      skinIds: [],
      equipmentDefinitionIds: [],
      equipmentFragments: {},
    },
  },
  {
    id: 'aurora-whale-song-skin',
    name: '极光鲸歌列车长套装',
    displayPrice: '¥30',
    description: '固定解锁男女列车长「极光鲸歌」款式，并永久计入典藏皮肤属性。',
    oneTime: true,
    reward: {
      gears: 0,
      routeMarks: 0,
      starTickets: 0,
      cosmeticIds: [],
      skinIds: ['skin-aurora-whale-song'],
      equipmentDefinitionIds: [],
      equipmentFragments: {},
    },
  },
  {
    id: 'coral-assault-equipment-pack',
    name: '珊瑚突击装备组',
    displayPrice: '¥18',
    description: '固定获得珊瑚突击四槽装备各一件；装备属性购买前完整展示。',
    oneTime: true,
    reward: {
      gears: 0,
      routeMarks: 0,
      starTickets: 0,
      cosmeticIds: [],
      skinIds: [],
      equipmentDefinitionIds: [
        'coral-cannon',
        'lightwave-carriage',
        'surge-core',
        'pursuit-instrument',
      ],
      equipmentFragments: {},
    },
  },
] as const;

export function getProductDefinition(productId: string): ProductDefinition | undefined {
  return PRODUCT_CATALOG.find((product) => product.id === productId);
}
