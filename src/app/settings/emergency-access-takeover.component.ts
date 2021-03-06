import {
    Component,
    EventEmitter,
    Input,
    OnInit,
    Output,
} from '@angular/core';

import { ToasterService } from 'angular2-toaster';

import { ApiService } from 'jslib/abstractions/api.service';
import { CryptoService } from 'jslib/abstractions/crypto.service';
import { I18nService } from 'jslib/abstractions/i18n.service';
import { MessagingService } from 'jslib/abstractions/messaging.service';
import { PasswordGenerationService } from 'jslib/abstractions/passwordGeneration.service';
import { PlatformUtilsService } from 'jslib/abstractions/platformUtils.service';
import { PolicyService } from 'jslib/abstractions/policy.service';
import { UserService } from 'jslib/abstractions/user.service';
import { ChangePasswordComponent } from 'jslib/angular/components/change-password.component';

import { KdfType } from 'jslib/enums/kdfType';
import { SymmetricCryptoKey } from 'jslib/models/domain/symmetricCryptoKey';
import { EmergencyAccessPasswordRequest } from 'jslib/models/request/emergencyAccessPasswordRequest';

@Component({
    selector: 'emergency-access-takeover',
    templateUrl: 'emergency-access-takeover.component.html',
})
export class EmergencyAccessTakeoverComponent extends ChangePasswordComponent implements OnInit {
    @Output() onDone = new EventEmitter();
    @Input() emergencyAccessId: string;
    @Input() name: string;
    @Input() email: string;
    @Input() kdf: KdfType;
    @Input() kdfIterations: number;

    formPromise: Promise<any>;

    constructor(i18nService: I18nService, cryptoService: CryptoService,
        messagingService: MessagingService, userService: UserService,
        passwordGenerationService: PasswordGenerationService,
        platformUtilsService: PlatformUtilsService, policyService: PolicyService,
        private apiService: ApiService, private toasterService: ToasterService) {
        super(i18nService, cryptoService, messagingService, userService, passwordGenerationService,
            platformUtilsService, policyService);
    }

    // tslint:disable-next-line
    async ngOnInit() { }

    async submit() {
        if (!await this.strongPassword()) {
            return;
        }

        const takeoverResponse = await this.apiService.postEmergencyAccessTakeover(this.emergencyAccessId);

        const oldKeyBuffer = await this.cryptoService.rsaDecrypt(takeoverResponse.keyEncrypted);
        const oldEncKey = new SymmetricCryptoKey(oldKeyBuffer);

        if (oldEncKey == null) {
            this.toasterService.popAsync('error', this.i18nService.t('errorOccurred'), this.i18nService.t('unexpectedError'));
            return;
        }

        const key = await this.cryptoService.makeKey(this.masterPassword, this.email, takeoverResponse.kdf, takeoverResponse.kdfIterations);
        const masterPasswordHash = await this.cryptoService.hashPassword(this.masterPassword, key);

        const encKey = await this.cryptoService.remakeEncKey(key, oldEncKey);

        const request = new EmergencyAccessPasswordRequest();
        request.newMasterPasswordHash = masterPasswordHash;
        request.key = encKey[1].encryptedString;

        this.apiService.postEmergencyAccessPassword(this.emergencyAccessId, request);

        try {
            this.onDone.emit();
        } catch { }
    }
}
