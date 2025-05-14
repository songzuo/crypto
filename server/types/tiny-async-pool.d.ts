declare module 'tiny-async-pool' {
  function asyncPool<T, R>(
    poolLimit: number,
    array: T[],
    iteratorFn: (item: T) => Promise<R>
  ): Promise<R[]>;
  
  export default asyncPool;
}