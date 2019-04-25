/**
 * Schemats takes sql database schema and creates corresponding typescript definitions
 * Created by xiamx on 2016-08-10.
 */

import { generateEnumType, generateTableTypes, generateTableInterface, normalizeName } from './typescript'
import { getDatabase, Database } from './schema'
import Options, { OptionValues } from './options'
import { processString, Options as ITFOptions } from 'typescript-formatter'
import * as fs from 'fs';
const pkgVersion = require('../package.json').version

function getTime () {
    let padTime = (value: number) => `0${value}`.slice(-2)
    let time = new Date()
    const yyyy = time.getFullYear()
    const MM = padTime(time.getMonth() + 1)
    const dd = padTime(time.getDate())
    const hh = padTime(time.getHours())
    const mm = padTime(time.getMinutes())
    const ss = padTime(time.getSeconds())
    return `${yyyy}-${MM}-${dd} ${hh}:${mm}:${ss}`
}

function buildHeader (db: Database, tables: string[], schema: string|null, options: OptionValues): string {
    let commands = ['schemats', 'generate', '-c', db.connectionString.replace(/:\/\/.*@/,'://username:password@')]
    if (options.camelCase) commands.push('-C')
    if (tables.length > 0) {
        tables.forEach((t: string) => {
            commands.push('-t', t)
        })
    }
    if (schema) {
        commands.push('-s', schema)
    }

    return `
        /**
         * AUTO-GENERATED FILE @ ${getTime()} - DO NOT EDIT!
         *
         * This file was automatically generated by schemats v.${pkgVersion}
         * $ ${commands.join(' ')}
         *
         */

    `
}

export async function typescriptOfTable (db: Database|string, 
                                         table: string,
                                         schema: string,
                                         options = new Options()) {
    if (typeof db === 'string') {
        db = getDatabase(db)
    }

    let interfaces = ''
    let tableTypes = await db.getTableTypes(table, schema, options)
    // interfaces += generateTableTypes(table, tableTypes, options)
    interfaces += generateTableInterface(table, tableTypes, options)
    return interfaces
}

export async function typescriptOfSchema (db: Database|string,
                                          tables: string[] = [],
                                          schema: string|null = null,
                                          options: OptionValues = {}): Promise<string> {
    if (typeof db === 'string') {
        db = getDatabase(db)
    }

    if (!schema) {
        schema = db.getDefaultSchema()
    }

    if (tables.length === 0) {
        tables = await db.getSchemaTables(schema)
    }

    const optionsObject = new Options(options)

    const enumTypes = generateEnumType(await db.getEnumTypes(schema), optionsObject)
    const interfacePromises = tables.map((table) => typescriptOfTable(db, table, schema as string, optionsObject))
    const interfaces = await Promise.all(interfacePromises)
        .then(tsOfTable => tsOfTable.join(''))
    
    const interfaceNames = tables.map(t => normalizeName(optionsObject.transformTypeName(t), optionsObject));
    const unions = `
      export type Selectable = ${interfaceNames.map(name => `${name}.Selectable`).join(' | ')};
      export type Whereable = ${interfaceNames.map(name => `${name}.Whereable`).join(' | ')};
      export type Insertable = ${interfaceNames.map(name => `${name}.Insertable`).join(' | ')};
      export type Updatable = ${interfaceNames.map(name => `${name}.Updatable`).join(' | ')};
      export type Table = ${interfaceNames.map(name => `${name}.Table`).join(' | ')};
      export type Column = ${interfaceNames.map(name => `${name}.Column`).join(' | ')};
      export type AllTables = [${interfaceNames.map(name => `${name}.Table`).join(', ')}];
      
      export interface InsertSignatures {
        ${interfaceNames.map(name =>
          `(client: Queryable, table: ${name}.Table, values: ${name}.Insertable): Promise<${name}.Selectable>;
           (client: Queryable, table: ${name}.Table, values: ${name}.Insertable[]): Promise<${name}.Selectable[]>;`).join('\n')}
      }
      export interface UpsertSignatures {
        ${interfaceNames.map(name =>
          `(client: Queryable, table: ${name}.Table, values: ${name}.Insertable, ...uniqueCols: ${name}.Column[]): Promise<${name}.UpsertReturnable>;
          (client: Queryable, table: ${name}.Table, values: ${name}.Insertable[], ...uniqueCols: ${name}.Column[]): Promise<${name}.UpsertReturnable[]>;`).join('\n')}
      }
      export interface UpdateSignatures {
        ${interfaceNames.map(name =>
          `(client: Queryable, table: ${name}.Table, values: ${name}.Updatable, where: ${name}.Whereable): Promise<${name}.Selectable[]>;`).join('\n')}
      }
      export interface DeleteSignatures {
        ${interfaceNames.map(name =>
        `(client: Queryable, table: ${name}.Table, where: ${name}.Whereable): Promise<${name}.Selectable[]>;`).join('\n')}
      }
      export interface SelectSignatures {
        ${interfaceNames.map(name =>
          `(client: Queryable, table: ${name}.Table, where?: ${name}.Whereable, options?: ${name}.SelectOptions, count?: boolean): Promise<${name}.Selectable[]>;`).join('\n')}
      }
      export interface SelectOneSignatures {
        ${interfaceNames.map(name =>
          `(client: Queryable, table: ${name}.Table, where?: ${name}.Whereable, options?: ${name}.SelectOptions): Promise<${name}.Selectable | undefined>;`).join('\n')}
      }
      export interface CountSignatures {
        ${interfaceNames.map(name =>
          `(client: Queryable, table: ${name}.Table, where?: ${name}.Whereable): Promise<number>;`).join('\n')}
      }
    `

    let output = '/* tslint:disable */\n\n'
    if (optionsObject.options.writeHeader) {
        output += buildHeader(db, tables, schema, options)
    }

    output += `
      import {
        DefaultType,
        JSONValue,
        JSONArray,
        SQLFragment,
        GenericSQLExpression,
        ColumnNames,
        ColumnValues,
        Queryable,
        UpsertAction,
      } from "./core";

    `;

    output += enumTypes
    output += interfaces
    output += unions;

    const formatterOption: ITFOptions = {
        replace: false,
        verify: false,
        tsconfig: true,
        tslint: true,
        editorconfig: true,
        tsfmt: true,
        vscode: false,
        tsconfigFile: null,
        tslintFile: null,
        vscodeFile: null,
        tsfmtFile: null
    }

    const processedResult = await processString('schema.ts', output, formatterOption)
    return processedResult.dest
}

export {Database, getDatabase} from './schema'
export {Options, OptionValues}
