/**
 * Copyright (c) 2019 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author Alexander Rose <alexander.rose@weirdbyte.de>
 */


import { Column } from '../../../mol-data/db';
import { Vec4 } from '../../../mol-math/linear-algebra';

// https://www.ebi.ac.uk/emdb/documentation#seg_model

export const PlyTypeByteLength = {
    'char': 1,
    'uchar': 1,
    'short': 2,
    'ushort': 2,
    'int': 4,
    'uint': 4,
    'float': 4,
    'double': 8,

    'int8': 1,
    'uint8': 1,
    'int16': 2,
    'uint16': 2,
    'int32': 4,
    'uint32': 4,
    'float32': 4,
    'float64': 8
};
export type PlyType = keyof typeof PlyTypeByteLength
export const PlyTypes = new Set(Object.keys(PlyTypeByteLength));
export function PlyType(str: string) {
    if (!PlyTypes.has(str)) throw new Error(`unknown ply type '${str}'`);
    return str as PlyType;
}

export interface Software {
    name?: string
    version?: string
    processing_details?: string
}

export interface TransformationMatrix{
    id: number
    rows: number
    cols: number
    data: string
}

export type PrimaryDescriptor = 'three_d_volume' | 'mesh_list' | 'shape_primitive_list'
export interface BoundingBox {
    xmin: object
    xmax: object
    ymin: object
    ymax: object
    zmin: object
    zmax: object
}

export interface ExternalReference {
    id: string
    resource: string
    accession: string
    label: string
    description: string
    url: string
}

export interface BiologicalAnnotation{
    name?: string
    description?: string
    number_of_instances: number
    external_references: ExternalReference[]
}

// TODO: later
// export interface MeshSFF {
//     id: number
//     vertices: VertexSFF
//     normals?: NormalSFF
//     triangles: TrianglesSFF
//     transform_id?: number
// }

export interface ThreeDVolume {
    lattice_id: number
    value: number
    transform_id?: number
}

export interface Segment {
    id: number
    parent_id: number
    biological_annotation?: BiologicalAnnotation
    colour: Vec4
    // mesh_list?: MeshSFF[]
    three_d_volume?: ThreeDVolume
    // shape_primitive_list: ShapePrimitiveBaseSFF[]
}
export type ModeSFFDataType = 'int8' |
'uint8' |
'int16' |
'uint16' |
'int32' |
'uint32' |
'uint64' |
'uint64' |
'float32' |
'float64'

export type Endianness = 'little' | 'big'

export interface VolumeStructureType{
    rows: number
    cols: number
    sections: number
}

export interface VolumeIndexType{
    rows: number
    cols: number
    sections: number
}

export interface LatticeSFF {
    id: number
    mode: ModeSFFDataType
    endianness: Endianness
    size: VolumeStructureType
    start: VolumeIndexType
    data: string
}
export interface SffFile {
    version?: string
    name?: string
    software_list: Software[]
    transfrom_list: TransformationMatrix[]
    primary_descriptor: PrimaryDescriptor
    bounding_box?: BoundingBox
    global_external_references: ExternalReference[]
    segment_list: Segment[]
    lattice_list: LatticeSFF[]
    details?: string
}

export function SffFile(json: string): SffFile {
    const data = JSON.parse(json) as SffFile;
    return data;
}