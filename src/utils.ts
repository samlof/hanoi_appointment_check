/** Sleep for milliseconds
 * @param {number} ms
 * @returns {Promise<void>} Promise to await
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function getRandomInt(max: number): number {
  return Math.floor(Math.random() * max);
}

export function getSeconds(): number {
  return Math.floor(Date.now() / 1000);
}
