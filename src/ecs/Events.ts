export class EventChannel<T>
{
    private _read: T[] = [];
    private _write: T[] = [];

    /** Emit an event into the current phase write buffer. */
    public emit(ev: T): void
    {
        this._write.push(ev);
    }

    /**
     * Drain readable events (emitted in the previous phase), then clears the read buffer.
     * Zero allocations; fast for hot paths.
     */
    public drain(fn: (ev: T) => void): void
    {
        const r = this._read;
        for (let i = 0; i < r.length; i++) fn(r[i]!);
        this.clear();
    }

    /**
     * Read-only view of readable events (previous phase).
     * Valid until the next schedule boundary (swapEvents).
     * Do not store this reference long-term.
     */
    public values(): readonly T[]
    {
        return this._read;
    }

    public count(): number
    {
        return this._read.length;
    }

    public clear(): void
    {
        this._read.length = 0;
    }

    /** Clears both buffers (rarely needed, but useful for resets). */
    public clearAll(): void 
    {
        this._read.length = 0;
        this._write.length = 0;
    }

    /** @internal Called by World at phase boundaries. */
    public swapBuffers(): void
    {
        const tmp = this._read;
        this._read = this._write;
        this._write = tmp;
        this._write.length = 0; // drop any unconsumed read events that were in tmp
    }
}
