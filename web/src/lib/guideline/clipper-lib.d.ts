declare module 'clipper-lib' {
  interface Point {
    X: number;
    Y: number;
  }
  type Paths = Point[][];
  class Clipper {
    static ioStrictlySimple: number;
    constructor(options?: number);
    AddPaths(paths: Paths, polygonType: number, closed: boolean): boolean;
    Execute(operation: number, solution: Paths, subjectFill: number, clipFill: number): boolean;
  }
  const library: {
    Clipper: typeof Clipper;
    ClipType: { ctUnion: number };
    PolyType: { ptSubject: number };
    PolyFillType: { pftNonZero: number };
  };
  export default library;
}
