import type { ChoreographyContext } from '@cryventure/core';
import type { CellMove } from '../ops.ts';

/** Typed reads of AES op fields from the generic choreography context. */
export function stepRound(context: ChoreographyContext): number {
  const round = (context.step as { round?: unknown }).round;
  return typeof round === 'number' ? round : 0;
}

export function stepRoundKeyIndex(context: ChoreographyContext): number {
  const index = (context.step as { roundKeyIndex?: unknown }).roundKeyIndex;
  return typeof index === 'number' ? index : stepRound(context);
}

function isCellMove(value: unknown): value is CellMove {
  const move = value as Partial<CellMove> | null;
  return typeof move?.from === 'number' && typeof move.to === 'number';
}

export function stepMoves(context: ChoreographyContext): CellMove[] {
  const moves = (context.step as { moves?: unknown }).moves;
  return Array.isArray(moves) ? moves.filter(isCellMove) : [];
}

export function stateBefore(context: ChoreographyContext): readonly number[] {
  return context.before['state'] ?? [];
}

export function stateAfter(context: ChoreographyContext): readonly number[] {
  return context.after['state'] ?? [];
}
