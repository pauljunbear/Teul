/** Native mock extension for authored geometry; no runtime Figma writes or test framework dependency. */
import {
  createInMemoryFigmaPluginApi,
  type FakeNode,
  type InMemoryFigmaOptions,
} from './inMemoryFigmaPluginApi';
type Mutable<T> = { -readonly [K in keyof T]: T[K] };
const FONT = { family: 'Arial', style: 'Regular' };
export type AuthoredNativeMockNodeV1 = FakeNode & {
  effects: Effect[];
  blendMode: BlendMode;
  rotation: number;
  layoutMode: string;
  vectorPaths: Mutable<VectorPath>[];
  relativeTransform: Transform;
};

/** Only native geometry fields absent from the shared legacy mock are added here. */
export function createInMemoryAuthoredFigmaPluginApiV1(
  options: InMemoryFigmaOptions = {},
  textHeight = 16
) {
  const environment = createInMemoryFigmaPluginApi({ fonts: [FONT], ...options });
  const { document, figma } = environment;
  const createNode = document.createNode.bind(document);
  document.createNode = (type, kind) => {
    const node = createNode(type, kind) as AuthoredNativeMockNodeV1;
    node.effects = [];
    node.blendMode = 'NORMAL';
    node.rotation = 0;
    if (type === 'FRAME') node.layoutMode = 'NONE';
    node.vectorPaths = [];
    Object.defineProperty(node, 'relativeTransform', {
      configurable: true,
      get: () => [
        [1, 0, node.x],
        [0, 1, node.y],
      ],
    });
    if (type === 'TEXT') {
      let characters = '';
      Object.defineProperty(node, 'characters', {
        get: () => characters,
        set: (value: string) => {
          characters = value;
          node.height = textHeight;
        },
      });
    }
    return node;
  };
  figma.createVector = () => document.createNode('VECTOR', 'rectangle') as unknown as VectorNode;
  const createVariable = document.createVariable.bind(document);
  document.createVariable = (...args) => {
    const variable = createVariable(...args);
    const resolve = (variableId: string, consumer: FakeNode, seen = new Set<string>()): RGBA => {
      if (seen.has(variableId)) throw new Error('Mock alias cycle.');
      seen.add(variableId);
      const target = document.variables.get(variableId)!;
      const collection = document.collections.get(target.variableCollectionId)!;
      let node: FakeNode | null = consumer,
        modeId: string | undefined;
      while (node && !modeId) {
        modeId = node.explicitVariableModes[collection.id];
        node = node.parent;
      }
      const value = target.valuesByMode[modeId ?? collection.defaultModeId];
      if ('type' in value) return resolve(value.id, consumer, seen);
      return { ...value };
    };
    Object.assign(variable, {
      resolveForConsumer: (consumer: FakeNode) => ({
        resolvedType: 'COLOR',
        value: resolve(variable.id, consumer),
      }),
    });
    return variable;
  };
  return environment;
}
