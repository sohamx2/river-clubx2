export const REACTION_EMOJIS = ['👍','🔥','😂','😮','💀','❤️'] as const;
export type ReactionEmoji = typeof REACTION_EMOJIS[number];
export const REACTION_LABELS:Record<ReactionEmoji,string>={'👍':'thumbs up','🔥':'fire','😂':'laughing','😮':'surprised','💀':'skull','❤️':'heart'};
export const REACTION_DURATION_MS=6000;
export const REACTION_COOLDOWN_MS=1500;
