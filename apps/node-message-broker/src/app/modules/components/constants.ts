/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { TypedToken } from 'eldin';
import type { ICryptoService } from '../../../core/crypto/index.ts';
import type { IDeliveryService } from '../../../core/delivery/index.ts';
import type { IHubClient } from '../../../core/hub/index.ts';

export const ComponentsInjectionKey = {
    Delivery: new TypedToken<IDeliveryService>('DeliveryService'),
    HubClient: new TypedToken<IHubClient>('HubClient'),
    Crypto: new TypedToken<ICryptoService>('CryptoService'),
};
