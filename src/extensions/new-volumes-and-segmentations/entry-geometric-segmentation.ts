/**
 * Copyright (c) 2018-2022 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author Adam Midlik <midlik@gmail.com>
 */

import { StateTransforms } from '../../mol-plugin-state/transforms';
import { CreateGroup } from '../../mol-plugin-state/transforms/misc';
import { VolsegEntryData } from './entry-root';
import { CreateShapePrimitivesProvider } from './shape_primitives';
import { GeometricSegmentationData } from './volseg-api/data';


const GEOMETRIC_SEGMENTATION_GROUP_TAG = 'geometric-segmentation-group';

export class VolsegGeometricSegmentationData {
    private entryData: VolsegEntryData;

    constructor(rootData: VolsegEntryData) {
        this.entryData = rootData;
    }

    async loadGeometricSegmentation() {
        const hasGeometricSegmentation = this.entryData.metadata.raw.grid.geometric_segmentation;
        if (hasGeometricSegmentation && hasGeometricSegmentation.segmentation_ids.length > 0) {
            let group = this.entryData.findNodesByTags(GEOMETRIC_SEGMENTATION_GROUP_TAG)[0]?.transform.ref;
            if (!group) {
                const newGroupNode = await this.entryData.newUpdate().apply(CreateGroup,
                    { label: 'Segmentation', description: 'Geometric segmentation' }, { tags: [GEOMETRIC_SEGMENTATION_GROUP_TAG], state: { isCollapsed: true } }).commit();
                group = newGroupNode.ref;
            }
            const timeInfo = this.entryData.metadata.raw.grid.geometric_segmentation!.time_info;
            for (const segmentationId of hasGeometricSegmentation.segmentation_ids) {
                const url = this.entryData.api.geometricSegmentationUrl(this.entryData.source, this.entryData.entryId, segmentationId);

                const primitivesData = await this.entryData._resolveStringUrl(url);

                const parsedData: GeometricSegmentationData = JSON.parse(primitivesData);
                console.log('parsedData', parsedData);
                const t = timeInfo[segmentationId];
                for (let timeframeIndex = t.start; timeframeIndex <= t.end; timeframeIndex++) {
                    const timeframeData = parsedData.primitives[timeframeIndex];
                    const descriptions = this.entryData.metadata.getAllDescriptionsForSegmentationAndTimeframe(segmentationId, 'primitive', timeframeIndex);
                    const segmentAnnotations = this.entryData.metadata.getAllSegmentAnotationsForSegmentationAndTimeframe(segmentationId, 'primitive', timeframeIndex);
                    const geometricSegmentationNode = await this.entryData.newUpdate().to(group)
                        .apply(CreateShapePrimitivesProvider, { data: timeframeData, descriptions: descriptions, segmentAnnotations: segmentAnnotations })
                        .apply(StateTransforms.Representation.ShapeRepresentation3D, { alpha: 0.5 })
                        .commit();
                }
            }
        }
    }
}