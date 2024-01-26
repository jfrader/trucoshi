declare module "safe-rng" {
  function combine(client: string, server: string, nonce: number): string;
  function sha512(string: string): string;
  function generateServerSeed(): string;
  function hexToBytes(hex: string): Uint8Array;
  function byteGenerator(
    clientseed: string,
    serverseed: string,
    nonce: number
  ): Uint8Array;
  function generateInteger(
    clientSeed: string,
    serverSeed: string,
    nonce: number,
    min: number,
    max: number
  ): number;
  function generateFloat(
    clientSeed: string,
    serverSeed: string,
    nonce: number,
    precision?: number
  ): number;
  function generateBool(
    clientSeed: string,
    serverSeed: string,
    nonce: number
  ): boolean;
  function selectRandomObject<
    T extends { probability: number } = {
      probability: number;
      [x: string]: any;
    }
  >(
    clientSeed: string,
    serverSeed: string,
    nonce: number,
    objects: Array<T>
  ): T | null;
}
