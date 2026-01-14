import type { Signature, TypeId } from "./Types";

export function signatureKey(sig: Signature): string {
    // canonical: sorted ascending, joined
    return sig.join(",");
}

export function mergeSignature(sig: Signature, add: TypeId): TypeId[] {
    const out = sig.slice() as TypeId[];
    // insert in sorted order (sig is sorted)
    let i = 0;
    while (i < out.length && out[i] < add) i++;
    if (out[i] === add) return out;
    out.splice(i, 0, add);
    return out;
}

export function subtractSignature(sig: Signature, remove: TypeId): TypeId[] {
    const out = sig.slice() as TypeId[];
    const idx = out.indexOf(remove);
    if (idx >= 0) out.splice(idx, 1);
    return out;
}

/**
 * True if `need` is a subset of `have`. Both must be sorted ascending.
 */
export function signatureHasAll(have: Signature, need: Signature): boolean {
    let i = 0;
    let j = 0;
    while (i < have.length && j < need.length) {
        const a = have[i]
        const b = need[j];
        if (a === b) { i++; j++; continue; }
        if (a < b) { i++; continue; }
        return false; // a > b -> missing b
    }
    return j === need.length;
}
