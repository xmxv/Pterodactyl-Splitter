import React, { useContext } from 'react';
import tw from 'twin.macro';
import { Formik, Form, Field as FormikField, FieldProps } from 'formik';
import { object, string, number } from 'yup';
import Field from '@/components/elements/Field';
import { Server } from '@/api/server/getServer';
import { ServerContext } from '@/state/server';
import { Button } from '@/components/elements/button/index';
import { Dialog, DialogWrapperContext } from '@/components/elements/dialog';
import asDialog from '@/hoc/asDialog';
import FlashMessageRender from '@/components/FlashMessageRender';
import Switch from '@/components/elements/Switch';
import Can from '@/components/elements/Can';
import { faExternalLinkSquareAlt, faTrash } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

interface RemainingResources {
    cpu: number;
    memory: number;
    disk: number;
    swap: number;
    databases: number;
    backups: number;
    allocations: number;
}

interface Props {
    server: Server;
    remainingResources: RemainingResources;
    onSplit?: (values: any) => Promise<void>;
    onUpdate?: (values: any) => Promise<void>;
    onDelete?: (serverUuid: string) => Promise<void>;
    onOpenServer?: (serverId: string) => void;
    isEdit?: boolean;
    editServer?: Server;
}

interface FormValues {
    name: string;
    description: string;
    cpu: number | string;
    memory: number | string;
    disk: number | string;
    swap: number;
    database_limit: number | string;
    backup_limit: number | string;
    allocation_limit: number | string;
    sync_subusers: boolean;
}

const fmtMiB = (mb: number): string => {
    if (mb <= 0) return '∞';
    return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb} MB`;
};

const SplitServerDialog = asDialog({ title: 'Split Server' })(({
    server,
    remainingResources,
    onSplit,
    onUpdate,
    onDelete,
    onOpenServer,
    isEdit,
    editServer,
}: Props) => {
    const { close } = useContext(DialogWrapperContext);
    const master = ServerContext.useStoreState((s) => s.server.data!);

    const effectiveResources: RemainingResources = isEdit && editServer
        ? {
            cpu:         master.limits.cpu === 0 ? 0 : remainingResources.cpu + editServer.limits.cpu,
            memory:      master.limits.memory === 0 ? 0 : remainingResources.memory + editServer.limits.memory,
            disk:        master.limits.disk === 0 ? 0 : remainingResources.disk + editServer.limits.disk,
            swap:        remainingResources.swap + editServer.limits.swap,
            databases:   remainingResources.databases + editServer.featureLimits.databases,
            backups:     remainingResources.backups + editServer.featureLimits.backups,
            allocations: remainingResources.allocations + editServer.featureLimits.allocations,
        }
        : remainingResources;

    const unlimited = (v: number) => v === 0;

    const validationSchema = object().shape({
        name: string().max(191),
        description: string().nullable(),
        cpu: number()
            .transform((v) => (v === '' ? undefined : Number(v)))
            .required('CPU is required')
            .min(10, 'Minimum 10%')
            .when([], (_, schema) =>
                !unlimited(effectiveResources.cpu)
                    ? schema.max(effectiveResources.cpu, `Max ${effectiveResources.cpu}%`)
                    : schema
            ),
        memory: number()
            .transform((v) => (v === '' ? undefined : Number(v)))
            .required('Memory is required')
            .min(128, 'Minimum 128 MiB')
            .when([], (_, schema) =>
                !unlimited(effectiveResources.memory)
                    ? schema.max(effectiveResources.memory, `Max ${fmtMiB(effectiveResources.memory)}`)
                    : schema
            ),
        disk: number()
            .transform((v) => (v === '' ? undefined : Number(v)))
            .required('Disk is required')
            .min(256, 'Minimum 256 MiB')
            .when([], (_, schema) =>
                !unlimited(effectiveResources.disk)
                    ? schema.max(effectiveResources.disk, `Max ${fmtMiB(effectiveResources.disk)}`)
                    : schema
            ),
        swap: number()
            .required()
            .min(0)
            .when([], (_, schema) =>
                effectiveResources.swap > 0
                    ? schema.max(effectiveResources.swap, `Max ${fmtMiB(effectiveResources.swap)}`)
                    : schema
            ),
        database_limit: number()
            .transform((v) => (v === '' ? 0 : Number(v)))
            .required()
            .min(0)
            .max(effectiveResources.databases, `Max ${effectiveResources.databases}`),
        backup_limit: number()
            .transform((v) => (v === '' ? 0 : Number(v)))
            .required()
            .min(0)
            .max(effectiveResources.backups, `Max ${effectiveResources.backups}`),
        allocation_limit: number()
            .transform((v) => (v === '' ? 0 : Number(v)))
            .required()
            .min(0)
            .max(effectiveResources.allocations, `Max ${effectiveResources.allocations}`),
        sync_subusers: string().oneOf(['true', 'false']),
    });

    const initialValues: FormValues = {
        name:             isEdit && editServer ? editServer.name : '',
        description:      isEdit && editServer ? (editServer.description ?? '') : '',
        cpu:              isEdit && editServer ? editServer.limits.cpu : '',
        memory:           isEdit && editServer ? editServer.limits.memory : '',
        disk:             isEdit && editServer ? editServer.limits.disk : '',
        swap:             isEdit && editServer ? editServer.limits.swap : 0,
        database_limit:   isEdit && editServer ? editServer.featureLimits.databases : '',
        backup_limit:     isEdit && editServer ? editServer.featureLimits.backups : '',
        allocation_limit: isEdit && editServer ? editServer.featureLimits.allocations : '',
        sync_subusers:    true,
    };

    const handleSubmit = (values: FormValues, { setSubmitting }: { setSubmitting: (v: boolean) => void }) => {
        const payload = {
            ...values,
            name: values.name.trim() || `${master.name}'s child`,
            swap: effectiveResources.swap === 0 ? 0 : values.swap,
        };

        const action = isEdit && onUpdate ? onUpdate(payload) : onSplit?.(payload) ?? Promise.resolve();

        action.then(() => close()).catch(() => setSubmitting(false));
    };

    return (
        <Formik initialValues={initialValues} validationSchema={validationSchema} onSubmit={handleSubmit}>
            {({ isSubmitting, submitForm }) => (
                <>
                    <FlashMessageRender byKey={'server:split'} />
                    <Form css={tw`m-0`}>
                        <div css={tw`grid grid-cols-1 md:grid-cols-2 gap-4`}>
                            <Field
                                name='name'
                                label='Name'
                                placeholder={`${master.name}'s child`}
                            />
                            <Field
                                name='description'
                                label='Description'
                                placeholder='(Optional)'
                            />
                            <Field
                                name='cpu'
                                label={`CPU (max ${unlimited(effectiveResources.cpu) ? '∞' : effectiveResources.cpu + '%'})`}
                                type='number'
                            />
                            <Field
                                name='memory'
                                label={`Memory MiB (max ${fmtMiB(effectiveResources.memory)})`}
                                type='number'
                            />
                            <Field
                                name='disk'
                                label={`Disk MiB (max ${fmtMiB(effectiveResources.disk)})`}
                                type='number'
                            />
                            {effectiveResources.swap > 0 && (
                                <Field
                                    name='swap'
                                    label={`Swap MiB (max ${fmtMiB(effectiveResources.swap)})`}
                                    type='number'
                                />
                            )}
                            <Field
                                name='database_limit'
                                label={`Databases (max ${effectiveResources.databases})`}
                                type='number'
                            />
                            <Field
                                name='backup_limit'
                                label={`Backups (max ${effectiveResources.backups})`}
                                type='number'
                            />
                            <Field
                                name='allocation_limit'
                                label={`Allocations (max ${effectiveResources.allocations})`}
                                type='number'
                            />
                        </div>

                        {!isEdit && (
                            <div css={tw`mt-4 bg-neutral-700 border border-neutral-800 p-4 rounded`}>
                                <FormikField name='sync_subusers'>
                                    {({ form }: FieldProps) => (
                                        <Switch
                                            name='sync_subusers'
                                            label='Sync Subusers'
                                            description='Copy subuser permissions from the master server to this split server.'
                                            defaultChecked
                                            readOnly={isSubmitting}
                                            onChange={(e) =>
                                                form.setFieldValue('sync_subusers', e.target.checked)
                                            }
                                        />
                                    )}
                                </FormikField>
                            </div>
                        )}
                    </Form>

                    <Dialog.Footer>
                        <Button.Text className='w-full sm:w-auto' onClick={close}>
                            Cancel
                        </Button.Text>

                        {isEdit && onDelete && editServer && (
                            <Can action='split.delete'>
                                <Button.Danger
                                    onClick={async () => {
                                        if (window.confirm('Delete this split server? This cannot be undone.')) {
                                            await onDelete(editServer.uuid);
                                            close();
                                        }
                                    }}
                                >
                                    <FontAwesomeIcon icon={faTrash} className='mr-1' /> Delete
                                </Button.Danger>
                            </Can>
                        )}

                        {isEdit && onOpenServer && editServer && (
                            <Button onClick={() => onOpenServer(editServer.id)}>
                                <FontAwesomeIcon icon={faExternalLinkSquareAlt} className='mr-1' /> Open
                            </Button>
                        )}

                        <Can action={isEdit ? 'split.update' : 'split.create'}>
                            <Button disabled={isSubmitting} onClick={submitForm}>
                                {isEdit ? 'Update' : 'Split'}
                            </Button>
                        </Can>
                    </Dialog.Footer>
                </>
            )}
        </Formik>
    );
});

export default SplitServerDialog;
