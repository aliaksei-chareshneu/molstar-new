/**
 * Copyright (c) 2023-2024 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author Adam Midlik <midlik@gmail.com>
 * @author David Sehnal <david.sehnal@gmail.com>
 * @author Aliaksei Chareshneu <chareshneu.tech@gmail.com>
 */

import { DensityServer_Data_Schema } from '../../mol-io/reader/cif/schema/density-server';
import { Segmentation_Data_Database } from '../../mol-io/reader/cif/schema/segmentation';
import { Download, ParseCcp4, ParseCif, ParseSFF } from '../../mol-plugin-state/transforms/data';
import { CustomModelProperties, CustomStructureProperties, ModelFromTrajectory, StructureComponent, StructureFromModel, TrajectoryFromMmCif, TrajectoryFromPDB, TransformStructureConformation } from '../../mol-plugin-state/transforms/model';
import { StructureRepresentation3D, VolumeRepresentation3D } from '../../mol-plugin-state/transforms/representation';
import { VolumeFromCcp4 } from '../../mol-plugin-state/transforms/volume';
import { PluginCommands } from '../../mol-plugin/commands';
import { PluginContext } from '../../mol-plugin/context';
import { StateObjectSelector } from '../../mol-state';
import { MolViewSpec } from './behavior';
import { setCamera, setCanvas, setFocus, suppressCameraAutoreset } from './camera';
import { MVSAnnotationsProvider } from './components/annotation-prop';
import { MVSAnnotationStructureComponent } from './components/annotation-structure-component';
import { MVSAnnotationTooltipsProvider } from './components/annotation-tooltips-prop';
import { CustomLabelProps, CustomLabelRepresentationProvider } from './components/custom-label/representation';
import { CustomTooltipsProvider } from './components/custom-tooltips-prop';
import { IsMVSModelProps, IsMVSModelProvider } from './components/is-mvs-model-prop';
import { AnnotationFromSourceKind, AnnotationFromUriKind, LoadingActions, UpdateTarget, collectAnnotationReferences, collectAnnotationTooltips, collectInlineLabels, collectInlineTooltips, colorThemeForNode, componentFromXProps, componentPropsFromSelector, isPhantomComponent, labelFromXProps, loadTree, makeNearestReprMap, prettyNameFromSelector, rawVolumeProps, representationProps, structureProps, transformProps, volumeRepresentationProps } from './load-helpers';
import { MVSData } from './mvs-data';
import { ParamsOfKind, SubTreeOfKind, validateTree } from './tree/generic/tree-schema';
import { convertMvsToMolstar, mvsSanityCheck } from './tree/molstar/conversion';
import { MolstarNode, MolstarTree, MolstarTreeSchema } from './tree/molstar/molstar-tree';
import { MVSTreeSchema } from './tree/mvs/mvs-tree';


/** Load a MolViewSpec (MVS) tree into the Mol* plugin.
 * If `options.replaceExisting`, remove all objects in the current Mol* state; otherwise add to the current state.
 * If `options.keepCamera`, ignore any camera positioning from the MVS state and keep the current camera position instead.
 * If `options.sanityChecks`, run some sanity checks and print potential issues to the console.
 * `options.sourceUrl` serves as the base for resolving relative URLs/URIs and may itself be relative to the window URL. */
export async function loadMVS(plugin: PluginContext, data: MVSData, options: { replaceExisting?: boolean, keepCamera?: boolean, sanityChecks?: boolean, sourceUrl?: string, doNotReportErrors?: boolean } = {}) {
    plugin.errorContext.clear('mvs');
    try {
        // console.log(`MVS tree:\n${MVSData.toPrettyString(data)}`)
        validateTree(MVSTreeSchema, data.root, 'MVS');
        if (options.sanityChecks) mvsSanityCheck(data.root);
        const molstarTree = convertMvsToMolstar(data.root, options.sourceUrl);
        // console.log(`Converted MolStar tree:\n${MVSData.toPrettyString({ root: molstarTree, metadata: { version: 'x', timestamp: 'x' } })}`)
        validateTree(MolstarTreeSchema, molstarTree, 'Converted Molstar');
        await loadMolstarTree(plugin, molstarTree, options);
    } catch (err) {
        plugin.log.error(`${err}`);
        throw err;
    } finally {
        if (!options.doNotReportErrors) {
            for (const error of plugin.errorContext.get('mvs')) {
                plugin.log.warn(error);
                PluginCommands.Toast.Show(plugin, {
                    title: 'Error',
                    message: error,
                    timeoutMs: 10000
                });
            }
        }
        plugin.errorContext.clear('mvs');
    }
}

/** Load a `MolstarTree` into the Mol* plugin.
 * If `replaceExisting`, remove all objects in the current Mol* state; otherwise add to the current state. */
async function loadMolstarTree(plugin: PluginContext, tree: MolstarTree, options?: { replaceExisting?: boolean, keepCamera?: boolean }) {
    const mvsExtensionLoaded = plugin.state.hasBehavior(MolViewSpec);
    if (!mvsExtensionLoaded) throw new Error('MolViewSpec extension is not loaded.');

    const context: MolstarLoadingContext = {};
    await loadTree(plugin, tree, MolstarLoadingActions, context, options);
    setCanvas(plugin, context.canvas);
    if (options?.keepCamera) {
        await suppressCameraAutoreset(plugin);
    } else {
        if (context.focus?.kind === 'camera') {
            await setCamera(plugin, context.focus.params);
        } else if (context.focus?.kind === 'focus') {
            await setFocus(plugin, context.focus.focusTarget, context.focus.params);
        } else {
            await setFocus(plugin, undefined, undefined);
        }
    }
}

/** Mutable context for loading a `MolstarTree`, available throughout the loading. */
export interface MolstarLoadingContext {
    /** Maps `*_from_[uri|source]` nodes to annotationId they should reference */
    annotationMap?: Map<MolstarNode<AnnotationFromUriKind | AnnotationFromSourceKind>, string>,
    /** Maps each node (on 'structure' or lower level) to its nearest 'representation' node */
    nearestReprMap?: Map<MolstarNode, MolstarNode<'representation'>>,
    focus?: { kind: 'camera', params: ParamsOfKind<MolstarTree, 'camera'> } | { kind: 'focus', focusTarget: StateObjectSelector, params: ParamsOfKind<MolstarTree, 'focus'> },
    canvas?: ParamsOfKind<MolstarTree, 'canvas'>,
    volume_data_3d_info?: DensityServer_Data_Schema['volume_data_3d_info']
}

/** Loading actions for loading a `MolstarTree`, per node kind. */
const MolstarLoadingActions: LoadingActions<MolstarTree, MolstarLoadingContext> = {
    root(updateParent: UpdateTarget, node: MolstarNode<'root'>, context: MolstarLoadingContext): UpdateTarget {
        context.nearestReprMap = makeNearestReprMap(node);
        return updateParent;
    },
    download(updateParent: UpdateTarget, node: MolstarNode<'download'>): UpdateTarget {
        return UpdateTarget.apply(updateParent, Download, {
            url: node.params.url,
            isBinary: node.params.is_binary,
        });
    },
    parse(updateParent: UpdateTarget, node: MolstarNode<'parse'>): UpdateTarget | undefined {
        const format = node.params.format;
        if (format === 'cif') {
            return UpdateTarget.apply(updateParent, ParseCif, {});
        } else if (format === 'pdb') {
            return updateParent;
        } else if (format === 'map') {
            const t = UpdateTarget._get_volume_info(updateParent);
            debugger;
            return UpdateTarget.apply(updateParent, ParseCcp4, {});
        } else if (format === 'map_and_sff') {
            return UpdateTarget.apply(updateParent, ParseSFF, {});
        } else {
            console.error(`Unknown format in "parse" node: "${format}"`);
            return undefined;
        }
    },
    trajectory(updateParent: UpdateTarget, node: MolstarNode<'trajectory'>): UpdateTarget | undefined {
        const format = node.params.format;
        if (format === 'cif') {
            return UpdateTarget.apply(updateParent, TrajectoryFromMmCif, {
                blockHeader: node.params.block_header ?? '', // Must set to '' because just undefined would get overwritten by createDefaults
                blockIndex: node.params.block_index ?? undefined,
            });
        } else if (format === 'pdb') {
            return UpdateTarget.apply(updateParent, TrajectoryFromPDB, {});
        } else {
            console.error(`Unknown format in "trajectory" node: "${format}"`);
            return undefined;
        }
    },
    model(updateParent: UpdateTarget, node: SubTreeOfKind<MolstarTree, 'model'>, context: MolstarLoadingContext): UpdateTarget {
        const annotations = collectAnnotationReferences(node, context);
        const model = UpdateTarget.apply(updateParent, ModelFromTrajectory, {
            modelIndex: node.params.model_index,
        });
        UpdateTarget.apply(model, CustomModelProperties, {
            properties: {
                [IsMVSModelProvider.descriptor.name]: { isMvs: true } satisfies IsMVSModelProps,
                [MVSAnnotationsProvider.descriptor.name]: { annotations },
            },
            autoAttach: [
                IsMVSModelProvider.descriptor.name,
                MVSAnnotationsProvider.descriptor.name,
            ],
        });
        return model;
    },
    raw_volume(updateParent: UpdateTarget, node: SubTreeOfKind<MolstarTree, 'raw_volume'>, context: MolstarLoadingContext): UpdateTarget {
        const props = rawVolumeProps(node);
        const rawVolume = UpdateTarget.apply(updateParent, VolumeFromCcp4, props);
        // TODO: tooltips, labels, etc.
        return rawVolume;
    },
    raw_volume_and_segmentation(updateParent: UpdateTarget, node: SubTreeOfKind<MolstarTree, 'raw_volume_and_segmentation'>, context: MolstarLoadingContext): UpdateTarget {
        // const props = rawVolumeAndSegmentationProps(node);
        const props = {};
        const rawVolume = UpdateTarget.apply(updateParent, VolumeFromCcp4, props);
        // const rawSegmentation = UpdateTarget.apply(rawVolume, VolumeFromSFF, props);
        // TODO: tooltips, labels, etc.
        return rawVolume;
    },
    structure(updateParent: UpdateTarget, node: SubTreeOfKind<MolstarTree, 'structure'>, context: MolstarLoadingContext): UpdateTarget {
        const props = structureProps(node);
        const struct = UpdateTarget.apply(updateParent, StructureFromModel, props);
        let transformed = struct;
        for (const t of transformProps(node)) {
            transformed = UpdateTarget.apply(transformed, TransformStructureConformation, t); // applying to the result of previous transform, to get the correct transform order
        }
        const annotationTooltips = collectAnnotationTooltips(node, context);
        const inlineTooltips = collectInlineTooltips(node, context);
        if (annotationTooltips.length + inlineTooltips.length > 0) {
            UpdateTarget.apply(struct, CustomStructureProperties, {
                properties: {
                    [MVSAnnotationTooltipsProvider.descriptor.name]: { tooltips: annotationTooltips },
                    [CustomTooltipsProvider.descriptor.name]: { tooltips: inlineTooltips },
                },
                autoAttach: [
                    MVSAnnotationTooltipsProvider.descriptor.name,
                    CustomTooltipsProvider.descriptor.name,
                ],
            });
        }
        const inlineLabels = collectInlineLabels(node, context);
        if (inlineLabels.length > 0) {
            const nearestReprNode = context.nearestReprMap?.get(node);
            UpdateTarget.apply(struct, StructureRepresentation3D, {
                type: {
                    name: CustomLabelRepresentationProvider.name,
                    params: { items: inlineLabels } satisfies Partial<CustomLabelProps>,
                },
                colorTheme: colorThemeForNode(nearestReprNode, context),
            });
        }
        return struct;
    },
    tooltip: undefined, // No action needed, already loaded in `structure`
    tooltip_from_uri: undefined, // No action needed, already loaded in `structure`
    tooltip_from_source: undefined, // No action needed, already loaded in `structure`
    component(updateParent: UpdateTarget, node: SubTreeOfKind<MolstarTree, 'component'>): UpdateTarget | undefined {
        if (isPhantomComponent(node)) {
            return updateParent;
        }
        const selector = node.params.selector;
        return UpdateTarget.apply(updateParent, StructureComponent, {
            type: componentPropsFromSelector(selector),
            label: prettyNameFromSelector(selector),
            nullIfEmpty: false,
        });
    },
    component_from_uri(updateParent: UpdateTarget, node: SubTreeOfKind<MolstarTree, 'component_from_uri'>, context: MolstarLoadingContext): UpdateTarget | undefined {
        if (isPhantomComponent(node)) return undefined;
        const props = componentFromXProps(node, context);
        return UpdateTarget.apply(updateParent, MVSAnnotationStructureComponent, props);
    },
    component_from_source(updateParent: UpdateTarget, node: SubTreeOfKind<MolstarTree, 'component_from_source'>, context: MolstarLoadingContext): UpdateTarget | undefined {
        if (isPhantomComponent(node)) return undefined;
        const props = componentFromXProps(node, context);
        return UpdateTarget.apply(updateParent, MVSAnnotationStructureComponent, props);
    },
    representation(updateParent: UpdateTarget, node: MolstarNode<'representation'>, context: MolstarLoadingContext): UpdateTarget {
        return UpdateTarget.apply(updateParent, StructureRepresentation3D, {
            ...representationProps(node.params),
            colorTheme: colorThemeForNode(node, context),
        });
    },
    volume_representation(updateParent: UpdateTarget, node: MolstarNode<'volume_representation'>, context: MolstarLoadingContext): UpdateTarget {
        const visualParams = {
            'type': {
                'name': node.params.type,
                'params': {}
            },
            'colorTheme': colorThemeForNode(node, context),
            'sizeTheme': {
                'name': 'uniform',
                'params': {
                    'value': 1
                }
            }
        };
        const params = {
            ...visualParams,
            ...volumeRepresentationProps(node.params),
        };
        const update = UpdateTarget.apply(updateParent, VolumeRepresentation3D, {
            ...params
        });
        return update;
    },
    color: undefined, // No action needed, already loaded in `representation`
    color_from_uri: undefined, // No action needed, already loaded in `representation`
    color_from_source: undefined, // No action needed, already loaded in `representation`
    label: undefined, // No action needed, already loaded in `structure`
    label_from_uri(updateParent: UpdateTarget, node: MolstarNode<'label_from_uri'>, context: MolstarLoadingContext): UpdateTarget {
        const props = labelFromXProps(node, context);
        return UpdateTarget.apply(updateParent, StructureRepresentation3D, props);
    },
    label_from_source(updateParent: UpdateTarget, node: MolstarNode<'label_from_source'>, context: MolstarLoadingContext): UpdateTarget {
        const props = labelFromXProps(node, context);
        return UpdateTarget.apply(updateParent, StructureRepresentation3D, props);
    },
    focus(updateParent: UpdateTarget, node: MolstarNode<'focus'>, context: MolstarLoadingContext): UpdateTarget {
        context.focus = { kind: 'focus', focusTarget: updateParent.selector, params: node.params };
        return updateParent;
    },
    camera(updateParent: UpdateTarget, node: MolstarNode<'camera'>, context: MolstarLoadingContext): UpdateTarget {
        context.focus = { kind: 'camera', params: node.params };
        return updateParent;
    },
    canvas(updateParent: UpdateTarget, node: MolstarNode<'canvas'>, context: MolstarLoadingContext): UpdateTarget {
        context.canvas = node.params;
        return updateParent;
    },
};
