/**
 * Copyright (c) 2019 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author Alexander Rose <alexander.rose@weirdbyte.de>
 */

import { StructureSelection, StructureQuery, Structure, Queries, StructureProperties as SP, StructureElement, Unit, ElementIndex } from '../../../mol-model/structure';
import { SequenceWrapper, StructureUnit } from './wrapper';
import { OrderedSet, Interval, SortedArray } from '../../../mol-data/int';
import { Loci } from '../../../mol-model/loci';
import { Sequence } from '../../../mol-model/sequence';
import { MissingResidues } from '../../../mol-model/structure/model/properties/common';
import { ColorNames } from '../../../mol-util/color/names';

export class PolymerSequenceWrapper extends SequenceWrapper<StructureUnit> {
    private readonly sequence: Sequence
    private readonly missing: MissingResidues
    private readonly observed: OrderedSet // sequences indices

    private readonly modelNum: number
    private readonly asymId: string

    private seqId(seqIdx: number) {
        return this.sequence.seqId.value(seqIdx)
    }

    residueLabel(seqIdx: number) {
        return this.sequence.label.value(seqIdx)
    }
    residueColor(seqIdx: number) {
        return this.missing.has(this.modelNum, this.asymId, this.seqId(seqIdx))
            ? ColorNames.grey
            : ColorNames.black
    }

    eachResidue(loci: Loci, apply: (set: OrderedSet) => boolean) {
        let changed = false
        const { structure, unit } = this.data
        if (StructureElement.Loci.is(loci)) {
            if (!Structure.areRootsEquivalent(loci.structure, structure)) return false
            loci = StructureElement.Loci.remap(loci, structure)

            const { offset } = this.sequence
            for (const e of loci.elements) {
                if (e.unit.id === unit.id) {
                    OrderedSet.forEach(e.indices, v => {
                        if (apply(getSeqIndices(e.unit, e.unit.elements[v], offset))) changed = true
                    })
                }
            }
        } else if (Structure.isLoci(loci)) {
            if (!Structure.areRootsEquivalent(loci.structure, structure)) return false

            if (apply(this.observed)) changed = true
        }
        return changed
    }

    getLoci(seqIdx: number) {
        const query = createResidueQuery(this.data.unit.id, this.seqId(seqIdx));
        return StructureSelection.toLoci2(StructureQuery.run(query, this.data.structure));
    }

    constructor(data: StructureUnit) {
        const l = StructureElement.Location.create(data.unit, data.unit.elements[0])
        const entitySeq = data.unit.model.sequence.byEntityKey[SP.entity.key(l)]

        const length = entitySeq.sequence.length
        const markerArray = new Uint8Array(length)

        super(data, markerArray, length)

        this.sequence = entitySeq.sequence
        this.missing = data.unit.model.properties.missingResidues

        this.modelNum = data.unit.model.modelNum
        this.asymId = Unit.isAtomic(data.unit) ? SP.chain.label_asym_id(l) : SP.coarse.asym_id(l)

        const missing: number[] = []
        for (let i = 0; i < length; ++i) {
            if (this.missing.has(this.modelNum, this.asymId, this.seqId(i))) missing.push(i)
        }
        this.observed = OrderedSet.subtract(Interval.ofBounds(0, length),  SortedArray.ofSortedArray(missing))
    }
}

function createResidueQuery(unitId: number, label_seq_id: number) {
    return Queries.generators.atoms({
        unitTest: ctx => {
            return SP.unit.id(ctx.element) === unitId
        },
        residueTest: ctx => {
            if (ctx.element.unit.kind === Unit.Kind.Atomic) {
                return SP.residue.label_seq_id(ctx.element) === label_seq_id
            } else {
                return (
                    SP.coarse.seq_id_begin(ctx.element) <= label_seq_id &&
                    SP.coarse.seq_id_end(ctx.element) >= label_seq_id
                )
            }
        }
    });
}

function getSeqIndices(unit: Unit, element: ElementIndex, offset: number): Interval {
    const { model } = unit
    switch (unit.kind) {
        case Unit.Kind.Atomic:
            const residueIndex = model.atomicHierarchy.residueAtomSegments.index[element]
            const seqId = model.atomicHierarchy.residues.label_seq_id.value(residueIndex)
            return Interval.ofSingleton(seqId - 1 - offset)
        case Unit.Kind.Spheres:
            return Interval.ofRange(
                model.coarseHierarchy.spheres.seq_id_begin.value(element) - 1 - offset,
                model.coarseHierarchy.spheres.seq_id_end.value(element) - 1 - offset
            )
        case Unit.Kind.Gaussians:
            return Interval.ofRange(
                model.coarseHierarchy.gaussians.seq_id_begin.value(element) - 1 - offset,
                model.coarseHierarchy.gaussians.seq_id_end.value(element) - 1 - offset
            )
    }
}