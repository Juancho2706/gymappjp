import * as React from 'react'
import { StyleSheet, Text, View } from 'react-native'
import type { ViewProps } from 'react-native'
import {
  Controller,
  FormProvider,
  useFormContext,
  type ControllerProps,
  type FieldPath,
  type FieldValues,
} from 'react-hook-form'

/**
 * EVA Form — RN port of the web shadcn `ui/form.tsx` (react-hook-form + zod).
 *
 * Same component surface as web so screens read 1:1:
 *   Form (= FormProvider) · FormField (= Controller + name context) ·
 *   FormItem (spacing wrapper) · FormLabel (danger on error) · FormMessage
 *   (zod error text in `text-danger-600`).
 *
 * There is no `FormControl`/`aria-*` layer: RN has no DOM ids to wire, so the
 * field's render prop hands `value`/`onChange`/`onBlur` straight to the input
 * (Input / Textarea / Select…). Errors surface via `FormMessage` (auto-reads
 * the field error) or by passing `error={...}` to the input.
 *
 * Colors come from DS token utilities (text-danger-600 / text-strong) so dark
 * mode + the white-label brand ramp resolve at runtime.
 *
 * @example
 *   const form = useForm({ resolver: zodResolver(schema), defaultValues });
 *   return (
 *     <Form {...form}>
 *       <FormField
 *         control={form.control}
 *         name="notes"
 *         render={({ field }) => (
 *           <FormItem>
 *             <FormLabel>Notas</FormLabel>
 *             <Textarea
 *               value={field.value}
 *               onChangeText={field.onChange}
 *               onBlur={field.onBlur}
 *             />
 *             <FormMessage />
 *           </FormItem>
 *         )}
 *       />
 *       <Button label="Guardar" onPress={form.handleSubmit(onSubmit)} />
 *     </Form>
 *   );
 */
const Form = FormProvider

type FormFieldContextValue<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
> = {
  name: TName
}

const FormFieldContext = React.createContext<FormFieldContextValue>(
  {} as FormFieldContextValue
)

function FormField<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>(props: ControllerProps<TFieldValues, TName>) {
  return (
    <FormFieldContext.Provider value={{ name: props.name }}>
      <Controller {...props} />
    </FormFieldContext.Provider>
  )
}

function useFormField() {
  const fieldContext = React.useContext(FormFieldContext)
  const { getFieldState, formState } = useFormContext()

  if (!fieldContext) {
    throw new Error('useFormField should be used within <FormField>')
  }

  const fieldState = getFieldState(fieldContext.name, formState)

  return {
    name: fieldContext.name,
    ...fieldState,
  }
}

function FormItem({ style, ...props }: ViewProps) {
  return <View style={[styles.item, style]} {...props} />
}

function FormLabel({
  children,
  style,
}: {
  children: React.ReactNode
  style?: React.ComponentProps<typeof Text>['style']
}) {
  const { error } = useFormField()
  return (
    <Text className={error ? 'text-danger-600' : 'text-strong'} style={[styles.label, style]}>
      {children}
    </Text>
  )
}

/**
 * Shows the field's zod error message (or `children` fallback). Renders nothing
 * when there is no error and no fallback — matches web behaviour.
 */
function FormMessage({ children }: { children?: React.ReactNode }) {
  const { error } = useFormField()
  const body = error ? String(error?.message ?? '') : children

  if (!body) return null

  return (
    <Text className="text-danger-600" style={styles.message}>
      {body}
    </Text>
  )
}

const styles = StyleSheet.create({
  item: { gap: 6 },
  label: { fontSize: 13, fontFamily: 'HankenGrotesk_600SemiBold' },
  message: { fontSize: 12, lineHeight: 16, fontFamily: 'HankenGrotesk_500Medium' },
})

export { Form, FormField, FormItem, FormLabel, FormMessage, useFormField }
