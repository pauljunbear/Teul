import {
  colorSystemGeometryShapeToSvgPathV1,
  type ColorSystemApplicationGeometryNodeV1,
} from '../../../src/lib/colorSystemApplicationGeometryV1';

export function GuidelinePaintedNode({
  node,
  paint,
}: {
  node: ColorSystemApplicationGeometryNodeV1;
  paint: (useId: string) => string;
}) {
  return (
    <>
      <path
        d={colorSystemGeometryShapeToSvgPathV1(node.shape)}
        fillRule="evenodd"
        fill={paint(node.useId)}
        data-use={node.useId}
      />
      {node.children.map(child => (
        <GuidelinePaintedNode key={child.id} node={child} paint={paint} />
      ))}
    </>
  );
}
