/**
 * Copyright (c) 2021 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author David Sehnal <david.sehnal@gmail.com>
 */

import { StructureElement } from '../../../structure/element';
import { StructureProperties } from '../../../structure/properties';

export interface ResidueSetEntry {
    label_asym_id: string,
    label_comp_id: string,
    label_seq_id: number,
    label_alt_id: string,
    ins_code: string,
    // 1_555 by default
    operator_name?: string
}

export class ResidueSet {
    private index = new Map<string, Map<number, ResidueSetEntry[]>>();
    private checkOperator: boolean = false;

    add(entry: ResidueSetEntry) {
        let root = this.index.get(entry.label_asym_id);
        if (!root) {
            root = new Map();
            this.index.set(entry.label_asym_id, root);
        }

        let entries = root.get(entry.label_seq_id);
        if (!entries) {
            entries = [];
            root.set(entry.label_seq_id, entries);
        }

        const exists = this._find(entry, entries);
        if (!exists) {
            entries.push(entry);
            return true;
        }

        return false;
    }

    getLabel(entry: ResidueSetEntry) {
        return `${entry.label_asym_id} ${entry.label_comp_id} ${entry.label_seq_id}:${entry.ins_code}:${entry.label_alt_id}${this.checkOperator ? ' ' + (entry.operator_name ?? '1_555') : ''}`;
    }

    hasLabelAsymId(asym_id: string) {
        return this.index.has(asym_id);
    }

    has(loc: StructureElement.Location) {
        const asym_id = _asym_id(loc);
        if (!this.index.has(asym_id)) return;
        const root = this.index.get(asym_id)!;
        const seq_id = _seq_id(loc);
        if (!root.has(seq_id)) return;
        const entries = root.get(seq_id)!;

        const comp_id = _comp_id(loc);
        const alt_id = _alt_id(loc);
        const ins_code = _ins_code(loc);
        const op_name = _op_name(loc) ?? '1_555';

        for (const e of entries) {
            if (e.label_comp_id !== comp_id || e.label_alt_id !== alt_id || e.ins_code !== ins_code) continue;
            if (this.checkOperator && (e.operator_name ?? '1_555') !== op_name) continue;

            return e;
        }
    }

    static getEntryFromLocation(loc: StructureElement.Location): ResidueSetEntry {
        return {
            label_asym_id: _asym_id(loc),
            label_comp_id: _comp_id(loc),
            label_seq_id: _seq_id(loc),
            label_alt_id: _alt_id(loc),
            ins_code: _ins_code(loc),
            operator_name: _op_name(loc) ?? '1_555'
        };
    }

    private _find(entry: ResidueSetEntry, xs: ResidueSetEntry[]) {
        for (const e of xs) {
            if (e.label_comp_id !== entry.label_comp_id || e.label_alt_id !== entry.label_alt_id || e.ins_code !== entry.ins_code) continue;
            if (this.checkOperator && (e.operator_name ?? '1_555') !== (entry.operator_name ?? '1_555')) continue;

            return true;
        }

        return false;
    }

    constructor(options?: { checkOperator?: boolean }) {
        this.checkOperator = options?.checkOperator ?? false;
    }
}

const _asym_id = StructureProperties.chain.label_asym_id;
const _seq_id = StructureProperties.residue.label_seq_id;
const _comp_id = StructureProperties.atom.label_comp_id;
const _alt_id = StructureProperties.atom.label_alt_id;
const _ins_code = StructureProperties.residue.pdbx_PDB_ins_code;
const _op_name = StructureProperties.unit.operator_name;