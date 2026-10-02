import { sampleTrack, type Track, type TrackProp } from '@cryventure/core';
import type { MotionValue } from 'motion/react';
import { NODE_STYLE_VARS, showsAfter } from '../choreography/nodeTracks.ts';

/** Per-grid choreography: the shared progress playhead, the values before the step and tracks per flat index. */
export interface GridMotion {
  progress: MotionValue<number>;
  before: readonly number[];
  tracks: ReadonlyMap<number, readonly Track[]>;
}

type StyleProp = Exclude<TrackProp, 'value'>;

/** One CSS custom property a node animates, with the tracks driving it (a later defined sample wins). */
interface StyleChannel {
  variable: string;
  tracks: readonly Track[];
}

/** A node that moves in this step: only the channels it actually animates, plus its value switch. */
export interface AnimatedNode {
  index: number;
  channels: readonly StyleChannel[];
  /** The node's `value` track (switch point = it reaching core's `VALUE_SWITCH`); `undefined` = the step's middle. */
  valueTrack: Track | undefined;
  /** Its value differs before and after the step, so its text switches. */
  switches: boolean;
}

function styleChannels(tracks: readonly Track[]): StyleChannel[] {
  const byProp = new Map<StyleProp, Track[]>();
  for (const track of tracks) {
    if (track.prop === 'value') continue;
    const list = byProp.get(track.prop) ?? [];
    list.push(track);
    byProp.set(track.prop, list);
  }
  return [...byProp].map(([prop, list]) => ({ variable: NODE_STYLE_VARS[prop], tracks: list }));
}

/** The grid's animated nodes, precomputed once per step: tracked cells and cells whose value changes. */
export function planGridMotion(motion: GridMotion | undefined, values: readonly number[]): AnimatedNode[] {
  if (motion === undefined) return [];
  const nodes: AnimatedNode[] = [];
  for (let index = 0; index < values.length; index++) {
    const tracks = motion.tracks.get(index) ?? [];
    const value = values[index]!;
    const switches = (motion.before[index] ?? value) !== value;
    if (tracks.length === 0 && !switches) continue;
    nodes.push({ index, channels: styleChannels(tracks), valueTrack: tracks.find((track) => track.prop === 'value'), switches });
  }
  return nodes;
}

/** Nodes with tracks are marked `data-animated` (value-only changes just switch their text). */
function isTracked(node: AnimatedNode): boolean {
  return node.channels.length > 0 || node.valueTrack !== undefined;
}

function sampleChannel(channel: StyleChannel, progress: number): number | undefined {
  let value: number | undefined;
  for (const track of channel.tracks) value = sampleTrack(track, progress) ?? value;
  return value;
}

/** Where the runner writes: one element per flat index (missing elements are skipped). */
export type ElementLookup = (index: number) => HTMLElement | undefined;

/**
 * Drives a grid's animated nodes from ONE progress listener: writes a node's CSS custom properties
 * only when their value changed and tracks which nodes show their after value (`version` bumps
 * whenever a value switch flips, so the grid re-renders only then).
 */
export interface GridMotionRunner {
  readonly version: number;
  showsAfter(index: number): boolean;
  /** Updates the value switches at `progress`; `true` when any flipped. */
  sync(progress: number): boolean;
  /** Writes the changed style channels at `progress` (no-op for unchanged values). */
  paint(progress: number): void;
  attach(lookup: ElementLookup): void;
  detach(): void;
  subscribe(listener: () => void): () => void;
  /** `sync` + `paint`, notifying subscribers when a value switch flipped. */
  update(progress: number): void;
}

/** One node's element and the CSS values last written to it. */
interface PaintTarget {
  node: AnimatedNode;
  element: HTMLElement;
  written: Map<string, string>;
}

/** Writes the node's channels at `progress`, skipping values that did not change. */
function paintTarget({ node, element, written }: PaintTarget, progress: number): void {
  for (const channel of node.channels) {
    const value = sampleChannel(channel, progress);
    const text = value === undefined ? '' : String(value);
    if (written.get(channel.variable) === text) continue;
    written.set(channel.variable, text);
    if (value === undefined) element.style.removeProperty(channel.variable);
    else element.style.setProperty(channel.variable, text);
  }
}

function clearTarget({ node, element }: PaintTarget): void {
  for (const channel of node.channels) element.style.removeProperty(channel.variable);
  element.removeAttribute('data-animated');
}

function attachTargets(nodes: readonly AnimatedNode[], lookup: ElementLookup): PaintTarget[] {
  return nodes.flatMap((node) => {
    const element = isTracked(node) ? lookup(node.index) : undefined;
    if (element === undefined) return [];
    element.setAttribute('data-animated', '');
    return [{ node, element, written: new Map<string, string>() }];
  });
}

/** Updates `after` for the switching nodes; `true` when any of them flipped. */
function syncSwitches(nodes: readonly AnimatedNode[], after: Map<number, boolean>, progress: number): boolean {
  let flipped = false;
  for (const node of nodes) {
    if (!node.switches) continue;
    const next = showsAfter(node.valueTrack, progress);
    if (after.get(node.index) !== next) flipped = true;
    after.set(node.index, next);
  }
  return flipped;
}

export function createGridMotionRunner(nodes: readonly AnimatedNode[], initialProgress: number): GridMotionRunner {
  const after = new Map<number, boolean>();
  const listeners = new Set<() => void>();
  let targets: PaintTarget[] = [];
  let version = 0;

  const runner: GridMotionRunner = {
    get version() {
      return version;
    },
    showsAfter: (index) => after.get(index) ?? true,
    sync(progress) {
      const flipped = syncSwitches(nodes, after, progress);
      if (flipped) version++;
      return flipped;
    },
    paint: (progress) => targets.forEach((target) => paintTarget(target, progress)),
    attach(lookup) {
      targets = attachTargets(nodes, lookup);
    },
    detach() {
      targets.forEach(clearTarget);
      targets = [];
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    update(progress) {
      const flipped = runner.sync(progress);
      runner.paint(progress);
      if (flipped) listeners.forEach((listener) => listener());
    },
  };
  runner.sync(initialProgress);
  return runner;
}
