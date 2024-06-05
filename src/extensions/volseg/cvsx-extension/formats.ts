import { loadCVSXFromAnything } from '.';
import { DataFormatProvider } from '../../../mol-plugin-state/formats/provider';
import { StateObjectRef } from '../../../mol-state';

/** Data format provider for CVSX format.
 */
// StateObjectRef is just a union type which is either the StateObjectSelector | StateObjectCell | StateTranform.Ref (str)
export const CVSXFormatProvider: DataFormatProvider<{}, StateObjectRef<any>, any> = DataFormatProvider({
    label: 'CVSX',
    description: 'CVSX',
    category: 'Miscellaneous',
    binaryExtensions: ['cvsx'],
    parse: async (plugin, data) => {
        return loadCVSXFromAnything(plugin, data);
    },
});