// Type the large generated data file as `unknown` so the compiler doesn't infer
// a multi-megabyte literal type from it (which is slow / memory-heavy). The real
// shape is applied via a cast in data.ts.
declare module '*.generated.json' {
  const value: unknown
  export default value
}
