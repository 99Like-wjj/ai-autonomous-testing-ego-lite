/** Build-time entry only. Runtime consumes the bundled vendor module, not node_modules. */
import { parse } from 'csv-parse/sync';
import readExcelFile from 'read-excel-file/node';
export function readCsv(text:string,delimiter=','):unknown[][] {return parse(text,{bom:true,columns:false,skip_empty_lines:false,trim:false,relax_column_count:true,delimiter}) as unknown[][];}
export async function readXlsx(bytes:Buffer):Promise<unknown> {return readExcelFile(bytes,{trim:false,parseNumber:(raw:string)=>({kind:'number' as const,raw})});}
