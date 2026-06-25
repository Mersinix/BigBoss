import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Package, AlertTriangle, TrendingUp, Search } from "lucide-react";

const fakeInventory = [
  { id: 1, name: "Espresso Roast 1kg", category: "Coffee Beans", stock: 100, minStock: 20, price: 25, status: "In Stock" },
  { id: 2, name: "Oat Milk 1L x 6", category: "Dairy Alternatives", stock: 50, minStock: 15, price: 18, status: "In Stock" },
  { id: 3, name: "Decaf House Blend 500g", category: "Coffee Beans", stock: 8, minStock: 20, price: 15, status: "Low Stock" },
  { id: 4, name: "Vanilla Syrup 1L", category: "Syrups & Flavors", stock: 42, minStock: 10, price: 12, status: "In Stock" },
  { id: 5, name: "Cold Brew Concentrate 5L", category: "Cold Brew", stock: 3, minStock: 10, price: 42, status: "Low Stock" },
  { id: 6, name: "Bamboo Cups x50", category: "Equipment & Supplies", stock: 200, minStock: 50, price: 14, status: "In Stock" },
  { id: 7, name: "Arabic Coffee Blend", category: "Coffee Beans", stock: 0, minStock: 20, price: 30, status: "Out of Stock" },
  { id: 8, name: "Almond Milk 1L x 6", category: "Dairy Alternatives", stock: 24, minStock: 15, price: 20, status: "In Stock" },
];

const statusStyle: Record<string, string> = {
  "In Stock": "bg-green-100 text-green-700",
  "Low Stock": "bg-amber-100 text-amber-700",
  "Out of Stock": "bg-red-100 text-red-700",
};

export default function InventoryPage() {
  const [search, setSearch] = useState("");
  const filtered = fakeInventory.filter((i) =>
    i.name.toLowerCase().includes(search.toLowerCase()) ||
    i.category.toLowerCase().includes(search.toLowerCase())
  );
  const lowStock = fakeInventory.filter((i) => i.stock < i.minStock).length;
  const outOfStock = fakeInventory.filter((i) => i.stock === 0).length;

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Inventory</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Track and manage your product stock levels.</p>
        </div>
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search products..." value={search} onChange={(e) => setSearch(e.target.value)} data-testid="input-search-inventory" />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="bg-green-500/10 rounded-xl p-3"><Package className="w-5 h-5 text-green-600" /></div>
            <div>
              <p className="text-xs text-muted-foreground">Total Products</p>
              <p className="text-2xl font-bold">{fakeInventory.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="bg-amber-500/10 rounded-xl p-3"><AlertTriangle className="w-5 h-5 text-amber-600" /></div>
            <div>
              <p className="text-xs text-muted-foreground">Low Stock</p>
              <p className="text-2xl font-bold text-amber-600">{lowStock}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="bg-red-500/10 rounded-xl p-3"><TrendingUp className="w-5 h-5 text-red-600" /></div>
            <div>
              <p className="text-xs text-muted-foreground">Out of Stock</p>
              <p className="text-2xl font-bold text-red-600">{outOfStock}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base font-semibold">Stock Overview</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Stock</TableHead>
                <TableHead>Min Stock</TableHead>
                <TableHead>Price (TND)</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">{item.name}</TableCell>
                  <TableCell className="text-muted-foreground">{item.category}</TableCell>
                  <TableCell>
                    <span className={item.stock < item.minStock ? "font-bold text-amber-600" : ""}>{item.stock}</span>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{item.minStock}</TableCell>
                  <TableCell>{item.price}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className={statusStyle[item.status]}>
                      {item.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Button size="sm" variant="outline" data-testid={`button-restock-${item.id}`}>Restock</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
