/**
 * Dispatcher para archivos a procesar.
 * Devuelve la metadata del archivo procesado ({tipo, filas, ...}) para que la UI pueda
 * mostrar qué se detectó en cada uno en vez de un genérico "listo".
 */

import { parseXLSX, inspeccionarArchivo, superposicionConCargas } from './xlsx-parser.js';

export { inspeccionarArchivo, superposicionConCargas };

/** `decision`: lo confirmado en la vista previa de mapeo (Fase 7), o null para el flujo automático. */
export async function dispatchFileParser(file, decision = null) {
    const ext = file.name.split('.').pop().toLowerCase();

    if (ext === 'xlsx' || ext === 'xls') {
        return await parseXLSX(file, decision);
    }

    if (ext === 'csv') {
        // SheetJS lee CSV con el mismo lector, así que se reusa el parser de Excel:
        // la detección de formato es por contenido de encabezados, no por extensión.
        return await parseXLSX(file, decision);
    }

    throw new Error(`Formato no soportado: .${ext}. Subí los archivos en .xlsx o .csv`);
}
