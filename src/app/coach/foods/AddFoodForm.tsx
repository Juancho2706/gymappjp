'use client'

import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"

const formSchema = z.object({
    name: z.string().min(2, { message: "Name must be at least 2 characters." }),
    serving_size: z.number().min(1, { message: "Serving size must be at least 1." }),
    serving_unit: z.string().min(1, { message: "Serving unit is required." }),
    calories: z.number().min(0, { message: "Calories must be a positive number." }),
    protein_g: z.number().min(0, { message: "Protein must be a positive number." }),
    carbs_g: z.number().min(0, { message: "Carbs must be a positive number." }),
    fats_g: z.number().min(0, { message: "Fats must be a positive number." }),
})

export function AddFoodForm({ coachId }: { coachId: string }) {
    const supabase = createClient()
    const form = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            name: "",
            serving_size: 100,
            serving_unit: "g",
            calories: 0,
            protein_g: 0,
            carbs_g: 0,
            fats_g: 0,
        },
    })

    async function onSubmit(values: z.infer<typeof formSchema>) {
        const { error } = await supabase.from('foods').insert([{ ...values, coach_id: coachId }])

        if (error) {
            toast.error("Error creating food: " + error.message)
        } else {
            toast.success("Food created successfully!")
            form.reset()
            // TODO: Refresh the food list
        }
    }

    return (
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2 col-span-2">
                    <Label htmlFor="name">Food Name</Label>
                    <Input id="name" {...form.register("name")} />
                    {form.formState.errors.name && <p className="text-red-500 text-xs">{form.formState.errors.name.message}</p>}
                </div>
                <div className="space-y-2">
                    <Label htmlFor="serving_size">Serving Size</Label>
                    <Input id="serving_size" type="number" {...form.register("serving_size", { valueAsNumber: true })} />
                    {form.formState.errors.serving_size && <p className="text-red-500 text-xs">{form.formState.errors.serving_size.message}</p>}
                </div>
                <div className="space-y-2">
                    <Label htmlFor="serving_unit">Serving Unit</Label>
                    <Input id="serving_unit" type="text" {...form.register("serving_unit")} />
                    {form.formState.errors.serving_unit && <p className="text-red-500 text-xs">{form.formState.errors.serving_unit.message}</p>}
                </div>
                <div className="space-y-2">
                    <Label htmlFor="calories">Calories</Label>
                    <Input id="calories" type="number" {...form.register("calories", { valueAsNumber: true })} />
                    {form.formState.errors.calories && <p className="text-red-500 text-xs">{form.formState.errors.calories.message}</p>}
                </div>
                <div className="space-y-2">
                    <Label htmlFor="protein_g">Protein (g)</Label>
                    <Input id="protein_g" type="number" {...form.register("protein_g", { valueAsNumber: true })} />
                    {form.formState.errors.protein_g && <p className="text-red-500 text-xs">{form.formState.errors.protein_g.message}</p>}
                </div>
                <div className="space-y-2">
                    <Label htmlFor="carbs_g">Carbs (g)</Label>
                    <Input id="carbs_g" type="number" {...form.register("carbs_g", { valueAsNumber: true })} />
                    {form.formState.errors.carbs_g && <p className="text-red-500 text-xs">{form.formState.errors.carbs_g.message}</p>}
                </div>
                <div className="space-y-2">
                    <Label htmlFor="fats_g">Fats (g)</Label>
                    <Input id="fats_g" type="number" {...form.register("fats_g", { valueAsNumber: true })} />
                    {form.formState.errors.fats_g && <p className="text-red-500 text-xs">{form.formState.errors.fats_g.message}</p>}
                </div>
            </div>
            <Button type="submit" className="w-full">Add Food</Button>
        </form>
    )
}
