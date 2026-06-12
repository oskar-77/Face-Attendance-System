import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useCreateEmployee, useListDepartments, getListEmployeesQueryKey, getListDepartmentsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ChevronLeft, UserPlus, Loader2 } from "lucide-react";
import { Link } from "wouter";

const formSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  employee_number: z.string().min(1, "Employee number is required"),
  department: z.string().min(1, "Department is required"),
  position: z.string().min(1, "Position is required"),
});

const DEFAULT_DEPARTMENTS = ["Engineering", "HR", "Finance", "Operations", "Sales", "Marketing", "IT", "Security"];

export default function NewEmployee() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: departments } = useListDepartments({
    query: { queryKey: getListDepartmentsQueryKey() }
  });

  const allDepts = departments && departments.length > 0 ? departments : DEFAULT_DEPARTMENTS;

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: "", employee_number: "", department: "", position: "" },
  });

  const createMutation = useCreateEmployee();

  const onSubmit = (values: z.infer<typeof formSchema>) => {
    createMutation.mutate(
      { data: values },
      {
        onSuccess: (emp) => {
          queryClient.invalidateQueries({ queryKey: getListEmployeesQueryKey() });
          toast({ title: "Employee created", description: `${emp.name} has been added.` });
          setLocation(`/employees/${emp.id}`);
        },
        onError: (err: unknown) => {
          const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? "Failed to create employee";
          toast({ title: "Error", description: msg, variant: "destructive" });
        }
      }
    );
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-4">
        <Link href="/employees">
          <Button variant="ghost" size="sm" className="gap-1.5">
            <ChevronLeft className="w-4 h-4" /> Back to Employees
          </Button>
        </Link>
      </div>

      <div>
        <h2 className="text-3xl font-bold tracking-tight">Add Employee</h2>
        <p className="text-muted-foreground mt-1">Register a new employee in the system</p>
      </div>

      <Card className="bg-card/50 border-border/50">
        <CardHeader>
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <UserPlus className="w-4 h-4 text-primary" />
            Employee Information
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Full Name / الاسم الكامل</FormLabel>
                      <FormControl>
                        <Input placeholder="Ahmed Al-Rashidi" className="bg-background/50" {...field} data-testid="input-employee-name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="employee_number"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Employee Number / رقم الموظف</FormLabel>
                      <FormControl>
                        <Input placeholder="EMP-001" className="bg-background/50" {...field} data-testid="input-employee-number" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="department"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Department / القسم</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger className="bg-background/50" data-testid="select-department">
                            <SelectValue placeholder="Select department" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {allDepts.map(d => (
                            <SelectItem key={d} value={d}>{d}</SelectItem>
                          ))}
                          <SelectItem value="Other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="position"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Position / الوظيفة</FormLabel>
                      <FormControl>
                        <Input placeholder="Software Engineer" className="bg-background/50" {...field} data-testid="input-position" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="pt-2 flex gap-3">
                <Button type="submit" className="gap-2 min-w-40" disabled={createMutation.isPending} data-testid="button-create-employee">
                  {createMutation.isPending
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Creating...</>
                    : <><UserPlus className="w-4 h-4" /> Add Employee</>}
                </Button>
                <Link href="/employees">
                  <Button type="button" variant="outline">Cancel</Button>
                </Link>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
