import { mergeSignature, signatureHasAll, signatureKey, subtractSignature } from "../src/ecs/Signature";

describe("Signature helpers", () => {
    describe("signatureKey", () => {
        it("joins the signature in canonical order", () => {
            expect(signatureKey([1, 2, 3])).toBe("1,2,3");
            expect(signatureKey([])).toBe("");
        });
    });

    describe("mergeSignature", () => {
        it("inserts a type id while keeping sort order", () => {
            expect(mergeSignature([1, 3, 5], 4)).toEqual([1, 3, 4, 5]);
            expect(mergeSignature([], 2)).toEqual([2]);
            expect(mergeSignature([2, 4], 1)).toEqual([1, 2, 4]);
        });

        it("does not duplicate if already present", () => {
            expect(mergeSignature([1, 2, 3], 2)).toEqual([1, 2, 3]);
        });
    });

    describe("subtractSignature", () => {
        it("removes a type id if present", () => {
            expect(subtractSignature([1, 2, 3], 2)).toEqual([1, 3]);
        });

        it("is a no-op if not present", () => {
            expect(subtractSignature([1, 2, 3], 99)).toEqual([1, 2, 3]);
        });
    });

    describe("signatureHasAll", () => {
        it("returns true when need is subset of have", () => {
            expect(signatureHasAll([1, 2, 3], [1, 3])).toBe(true);
            expect(signatureHasAll([1, 2, 3], [])).toBe(true);
            expect(signatureHasAll([1, 2, 3], [1, 2, 3])).toBe(true);
        });

        it("returns false when need is not a subset", () => {
            expect(signatureHasAll([1, 2, 3], [4])).toBe(false);
            expect(signatureHasAll([1, 3], [1, 2])).toBe(false);
            expect(signatureHasAll([], [1])).toBe(false);
        });
    });
});
