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

/**
 * Where the learner is in this visit: `visit` (just arrived), `replay` (asked to see the tour again)
 * or `done` (just chose a lens).
 */
export type PrologueSession = 'visit' | 'replay' | 'done';

/** A fresh visit shows the tour, or the welcome when the prologue was completed before. */
export function prologueView(session: PrologueSession, completed: boolean): PrologueView {
  if (session === 'done') return 'done';
  return session === 'visit' && completed ? 'welcomeBack' : 'tour';
}
