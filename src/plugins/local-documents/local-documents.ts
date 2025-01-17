import {
    getDefaultRevision,
    getDefaultRxDocumentMeta
} from '../../plugins/utils';

import type {
    RxChangeEvent,
    RxCollection,
    RxDatabase,
    RxDocument,
    RxDocumentWriteData,
    RxLocalDocument,
    RxLocalDocumentData
} from '../../types';

import {
    filter,
    map,
    startWith,
    mergeMap
} from 'rxjs/operators';
import { Observable } from 'rxjs';

import { getLocalDocStateByParent } from './local-documents-helper';
import { getSingleDocument, writeSingle } from '../../rx-storage-helper';



/**
 * save the local-document-data
 * throws if already exists
 */
export async function insertLocal<DocData extends Record<string, any> = any>(
    this: RxDatabase | RxCollection,
    id: string,
    data: DocData
): Promise<RxLocalDocument<DocData>> {
    const state = await getLocalDocStateByParent(this);

    // create new one
    const docData: RxDocumentWriteData<RxLocalDocumentData<DocData>> = {
        id: id,
        data,
        _deleted: false,
        _meta: getDefaultRxDocumentMeta(),
        _rev: getDefaultRevision(),
        _attachments: {}
    };

    return writeSingle(
        state.storageInstance,
        {
            document: docData
        },
        'local-document-insert'
    ).then(newDocData => state.docCache.getCachedRxDocument(newDocData) as any);
}

/**
 * save the local-document-data
 * overwrites existing if exists
 */
export function upsertLocal<DocData extends Record<string, any> = any>(
    this: any,
    id: string,
    data: DocData
): Promise<RxLocalDocument<DocData>> {
    return this.getLocal(id)
        .then((existing: RxDocument) => {
            if (!existing) {
                // create new one
                const docPromise = this.insertLocal(id, data);
                return docPromise;
            } else {
                // update existing
                return existing.incrementalModify(() => {
                    return data;
                });
            }
        });
}

export async function getLocal<DocData = any>(this: any, id: string): Promise<RxLocalDocument<DocData> | null> {
    const state = await getLocalDocStateByParent(this);
    const docCache = state.docCache;

    // check in doc-cache
    const found = docCache.getLatestDocumentDataIfExists(id);
    if (found) {
        return Promise.resolve(
            docCache.getCachedRxDocument(found) as any
        );
    }

    // if not found, check in storage instance
    return getSingleDocument(state.storageInstance, id)
        .then((docData) => {
            if (!docData) {
                return null;
            }
            return state.docCache.getCachedRxDocument(docData) as any;
        });
}

export function getLocal$<DocData = any>(this: RxCollection, id: string): Observable<RxLocalDocument<DocData> | null> {
    return this.$.pipe(
        startWith(null),
        mergeMap(async (cE: RxChangeEvent<RxLocalDocumentData> | null) => {
            if (cE) {
                return {
                    changeEvent: cE
                };
            } else {
                const doc = await this.getLocal(id);
                return {
                    doc: doc
                };
            }
        }),
        mergeMap(async (changeEventOrDoc) => {
            if (changeEventOrDoc.changeEvent) {
                const cE = changeEventOrDoc.changeEvent;
                if (!cE.isLocal || cE.documentId !== id) {
                    return {
                        use: false
                    };
                } else {
                    const doc = await this.getLocal(id);
                    return {
                        use: true,
                        doc: doc
                    };
                }
            } else {
                return {
                    use: true,
                    doc: changeEventOrDoc.doc
                };
            }
        }),
        filter(filterFlagged => filterFlagged.use),
        map(filterFlagged => {
            return filterFlagged.doc as any;
        })
    );
}
