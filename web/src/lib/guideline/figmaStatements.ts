import {
  assertFigmaNativeInventory,
  figmaNativeId,
  type FigmaNativeInventory,
} from './figmaInventory';
import { projectSourceStatements } from './sourceStatements';
import type { SourceStatement } from './sourceReviewContracts';
export type FigmaSourceStatement = SourceStatement;

/** Review decisions and model claims share the same complete, source-bound text windows. */
export function figmaSourceStatements(inventory: FigmaNativeInventory): FigmaSourceStatement[] {
  assertFigmaNativeInventory(inventory);
  return projectSourceStatements(inventory.texts, figmaNativeId);
}
