// Web MIDI input: plays the kit from an electronic drum set or pad controller.
import { midiTarget } from '../kit/pieces.js';

export class MidiInput {
  /**
   * @param {(target:{pieceId:string,sound:string}, velocity:number)=>void} onNote
   * @param {(devices:string[])=>void} onDevices
   */
  constructor(onNote, onDevices) {
    this.onNote = onNote;
    this.onDevices = onDevices;
    this.access = null;
    this.devices = [];
  }

  get supported() {
    return typeof navigator !== 'undefined' && typeof navigator.requestMIDIAccess === 'function';
  }

  get connected() {
    return !!this.access;
  }

  async connect() {
    if (!this.supported) throw new Error('This browser does not support Web MIDI. Try Chrome or Edge.');
    this.access = await navigator.requestMIDIAccess({ sysex: false });
    this.access.onstatechange = () => this.bind();
    this.bind();
  }

  bind() {
    if (!this.access) return;
    const inputs = [...this.access.inputs.values()];
    for (const input of inputs) input.onmidimessage = (e) => this.handle(e.data);
    this.devices = inputs.filter((i) => i.state !== 'disconnected').map((i) => i.name || 'MIDI device');
    this.onDevices?.(this.devices);
  }

  /** Handle a raw MIDI message (any channel: e-kits use 10, pad controllers often 1). */
  handle(data) {
    const [status, note, velocity] = data;
    if ((status & 0xf0) !== 0x90 || !velocity) return;
    const target = midiTarget(note);
    if (target) this.onNote(target, velocity / 127);
  }

  disconnect() {
    if (!this.access) return;
    for (const input of this.access.inputs.values()) input.onmidimessage = null;
    this.access.onstatechange = null;
    this.access = null;
    this.devices = [];
    this.onDevices?.([]);
  }
}
