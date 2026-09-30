import { defineExtensionMessaging } from '@webext-core/messaging';
import type { CaptureStatus, SampleMeta } from '../audio/domain/types';

interface ProtocolMap {
  'offscreen:start'(data: { streamId: string }): SampleMeta;
  'offscreen:stop'(data: null): SampleMeta;
  'offscreen:status'(data: null): { status: CaptureStatus };
  'background:pulse'(data: { bright: boolean }): void;
  'background:reset'(data: { sampleId?: string }): void;
  'background:capture-ended'(data: { reason: string; sampleId: string }): void;
}

export const { sendMessage, onMessage } = defineExtensionMessaging<ProtocolMap>();
