// mammoth no incluye tipos de TypeScript propios. Declaramos aquí lo mínimo
// que usamos de su bundle de navegador.
declare module "mammoth/mammoth.browser" {
  export interface MammothResult {
    value: string;
    messages: unknown[];
  }
  export interface MammothInput {
    arrayBuffer: ArrayBuffer;
  }
  interface Mammoth {
    extractRawText(input: MammothInput): Promise<MammothResult>;
    convertToHtml(input: MammothInput): Promise<MammothResult>;
  }
  const mammoth: Mammoth;
  export default mammoth;
}
