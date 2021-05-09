export const utils = {
  /** Sleep for milliseconds
   * @param {number} ms
   * @returns {Promise<void>} Promise to await
   */
  sleep: (ms: number): Promise<void> => {
    return new Promise((resolve) => setTimeout(resolve, ms));
  },

  getRandomInt: (max: number): number => {
    return Math.floor(Math.random() * max);
  },

  getSeconds: (): number => {
    return Math.floor(Date.now() / 1000);
  },
};
