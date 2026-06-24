/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { IContainer } from 'eldin';
import { AnalysisMessageController } from '../../../adapters/http/controllers/messages/index.ts';
import { ComponentsInjectionKey } from '../components/constants.ts';

export function createControllers(container: IContainer): Record<string, any>[] {
    const delivery = container.resolve(ComponentsInjectionKey.Delivery);

    return [
        new AnalysisMessageController({ delivery }),
    ];
}
