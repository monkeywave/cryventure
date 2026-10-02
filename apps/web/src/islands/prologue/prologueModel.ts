/** Scene order of the prologue (docs/PLAN.md §4): plain note, encryption, decryption, self-placement. */
export const SCENES = ['note', 'encrypt', 'decrypt', 'choose'] as const;

export type SceneId = (typeof SCENES)[number];

export const FIRST_SCENE: SceneId = SCENES[0];
export const CHOOSE_SCENE: SceneId = 'choose';

/** One-based position of a scene, for "Scene 2 of 4". */
export function sceneNumber(scene: SceneId): number {
  return SCENES.indexOf(scene) + 1;
}

export function nextScene(scene: SceneId): SceneId {
  return SCENES[Math.min(SCENES.indexOf(scene) + 1, SCENES.length - 1)] ?? scene;
}

export function previousScene(scene: SceneId): SceneId {
  return SCENES[Math.max(SCENES.indexOf(scene) - 1, 0)] ?? scene;
}

/** What the island shows: the tour, the confirmation after choosing a lens, or a returning learner's welcome. */
export type PrologueView = 'tour' | 'done' | 'welcomeBack';

export function prologueView(state: { justChose: boolean; completed: boolean; replaying: boolean }): PrologueView {
  if (state.justChose) return 'done';
  if (state.completed && !state.replaying) return 'welcomeBack';
  return 'tour';
}
