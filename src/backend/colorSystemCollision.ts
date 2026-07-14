import type { GenerateColorSystemMessage } from '../types/messages';
import { isTeulColorResource } from './colorResourceOwnership';

export type ColorCollisionPolicy = NonNullable<GenerateColorSystemMessage['collisionPolicy']>;

interface LocalOutputInventory {
  collections: VariableCollection[];
  styles: PaintStyle[];
}

function collectionName(systemName: string): string {
  return `${systemName} Colors`;
}

function styleBelongsToSystem(style: PaintStyle, systemName: string): boolean {
  return style.name === systemName || style.name.startsWith(`${systemName}/`);
}

async function inspectLocalOutput(
  systemName: string,
  createVariables: boolean,
  createStyles: boolean
): Promise<LocalOutputInventory> {
  const [collections, styles] = await Promise.all([
    createVariables
      ? figma.variables.getLocalVariableCollectionsAsync()
      : Promise.resolve([] as VariableCollection[]),
    createStyles ? figma.getLocalPaintStylesAsync() : Promise.resolve([] as PaintStyle[]),
  ]);
  return {
    collections: collections.filter(collection => collection.name === collectionName(systemName)),
    styles: styles.filter(style => styleBelongsToSystem(style, systemName)),
  };
}

function hasCollision(inventory: LocalOutputInventory): boolean {
  return inventory.collections.length > 0 || inventory.styles.length > 0;
}

function assertSingleCollection(inventory: LocalOutputInventory, systemName: string): void {
  if (inventory.collections.length > 1) {
    throw new Error(
      `Multiple local variable collections are named "${collectionName(systemName)}"`
    );
  }
}

export async function resolveColorSystemOutputName(
  message: GenerateColorSystemMessage
): Promise<{ outputName: string; warnings: string[] }> {
  const requestedName = message.scales.systemName;
  const policy: ColorCollisionPolicy = message.collisionPolicy ?? 'cancel';
  const inventory = await inspectLocalOutput(
    requestedName,
    message.createVariables,
    message.createStyles
  );
  assertSingleCollection(inventory, requestedName);

  if (!hasCollision(inventory)) return { outputName: requestedName, warnings: [] };

  if (policy === 'cancel') {
    throw new Error(
      `Local output already exists for "${requestedName}". Choose Update local or Create copy.`
    );
  }

  if (policy === 'update-local') {
    const unrelatedCollection = inventory.collections.find(
      collection => !isTeulColorResource(collection)
    );
    if (unrelatedCollection) {
      throw new Error(
        `"${unrelatedCollection.name}" is not marked as Teul-owned. Choose Create copy to protect unrelated local content.`
      );
    }
    const unrelatedStyle = inventory.styles.find(style => !isTeulColorResource(style));
    if (unrelatedStyle) {
      throw new Error(
        `"${unrelatedStyle.name}" is not marked as Teul-owned. Choose Create copy to protect unrelated local content.`
      );
    }
    return { outputName: requestedName, warnings: [] };
  }

  for (let copyNumber = 1; copyNumber <= 999; copyNumber++) {
    const candidate = `${requestedName} Copy${copyNumber === 1 ? '' : ` ${copyNumber}`}`;
    const candidateInventory = await inspectLocalOutput(
      candidate,
      message.createVariables,
      message.createStyles
    );
    assertSingleCollection(candidateInventory, candidate);
    if (!hasCollision(candidateInventory)) {
      return {
        outputName: candidate,
        warnings: [`Existing local output was preserved; created "${candidate}" instead.`],
      };
    }
  }

  throw new Error(`Could not find an available copy name for "${requestedName}"`);
}
