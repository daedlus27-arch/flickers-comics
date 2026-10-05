/* Reading a pasted shipment list, and working out which comic each line means. */
import test from "node:test";
import assert from "node:assert/strict";
import { parseReceiving, matchComic } from "../src/shared.mjs";

test("lines are read however they're written", () => {
  const got = parseReceiving(`Batman #14, 5
Batman #15 x3
5 x Flash #2
Superman 7 4
batman-14\t2
Absolute Batman #1
"Wonder Woman, The Lasso", 6`);
  assert.deepEqual(got, [
    { text: "Batman #14", qty: 5 }, { text: "Batman #15", qty: 3 }, { text: "Flash #2", qty: 5 },
    { text: "Superman 7", qty: 4 }, { text: "batman-14", qty: 2 }, { text: "Absolute Batman #1", qty: 1 }, { text: "Wonder Woman, The Lasso", qty: 6 }
  ]);
});

test("a bare issue number is not mistaken for a quantity", () => {
  assert.deepEqual(parseReceiving("Batman 14"), [{ text: "Batman 14", qty: 1 }]);
  assert.deepEqual(parseReceiving("Batman #14"), [{ text: "Batman #14", qty: 1 }]);
  assert.deepEqual(parseReceiving("100 Bullets #1"), [{ text: "100 Bullets #1", qty: 1 }]);
});

test("spreadsheet rows with a header are read by column name, and blank or oversized quantities are tamed", () => {
  const got = parseReceiving("Publisher,Title,Quantity\nDC,Batman #14,5\nDC,\"Flash, The #2\",\nImage,Saga #1,5000");
  assert.deepEqual(got, [{ text: "Batman #14", qty: 5 }, { text: "Flash, The #2", qty: 1 }, { text: "Saga #1", qty: 999 }]);
  assert.deepEqual(parseReceiving(""), []);
  assert.deepEqual(parseReceiving("\n\n  \n"), []);
});

const SHELF = [
  { id: "batman-14", cat: "issues", title: "Batman", num: "#14", publisher: "DC Comics", price: 500, stock: 3 },
  { id: "batman-423", cat: "issues", title: "Batman", num: "#423", variant: "Facsimile Edition", publisher: "DC Comics", price: 400, stock: 1 },
  { id: "flash-2", cat: "issues", title: "Flash", num: "#2", publisher: "DC Comics", price: 300, stock: 0 },
  { id: "saga-1", cat: "issues", title: "Saga", num: "#1", publisher: "Image Comics", price: 600, stock: 2 }
];

test("a line finds its comic by id, exact name, or partial name plus issue number", () => {
  assert.equal(matchComic(SHELF, "batman-14").product.id, "batman-14");
  assert.equal(matchComic(SHELF, "Batman #14").product.id, "batman-14");
  assert.equal(matchComic(SHELF, "batman 423").product.id, "batman-423");
  assert.equal(matchComic(SHELF, "sag 1").product.id, "saga-1", "partial words work");
  assert.equal(matchComic(SHELF, "FLASH #2").product.id, "flash-2");
});

test("an ambiguous or unknown line gives staff choices rather than guessing", () => {
  const amb = matchComic(SHELF, "Batman");
  assert.equal(amb.product, undefined);
  assert.deepEqual(amb.candidates.map(p => p.id).sort(), ["batman-14", "batman-423"]);
  const none = matchComic(SHELF, "Spawn #1");
  assert.equal(none.product, undefined);
  assert.deepEqual(none.candidates, []);
});

import { suggestReorder, reorderRows } from "../src/shared.mjs";

test("the reorder suggestion covers people waiting plus about two weeks of sales, less what's on the shelf", () => {
  assert.equal(suggestReorder(0, 0, 0), 1, "sold out with no data: at least one");
  assert.equal(suggestReorder(0, 3, 0), 3, "three people are waiting");
  assert.equal(suggestReorder(0, 2, 8), 4, "two waiting, and 8 sold in 8 weeks is about 2 a fortnight");
  assert.equal(suggestReorder(1, 0, 12), 2, "one left, 3 a fortnight: two more");
  assert.equal(suggestReorder(2, 0, 2), 0, "two left is enough for the little that sells");
});

test("only comics that are gone, nearly gone, or wanted by more people than there are copies make the list, most wanted first", () => {
  const shelf = [
    { id: "a", cat: "issues", title: "Alpha", price: 1, stock: 10 },
    { id: "b", cat: "issues", title: "Bravo", price: 1, stock: 0 },
    { id: "c", cat: "issues", title: "Charlie", price: 1, stock: 1 },
    { id: "d", cat: "issues", title: "Delta", price: 1, stock: 5 },
    { id: "e", cat: "issues", title: "Echo", price: 1, stock: 0 }
  ];
  const rows = reorderRows(shelf, { waiting: { b: 1, e: 4, d: 7 }, sold: { c: 9, b: 3 } });
  assert.deepEqual(rows.map(r => r.p.id), ["d", "e", "b", "c"], "d is on the shelf but seven people want it");
  assert.equal(rows[0].suggested, 2, "seven waiting, five on the shelf");
  assert.equal(rows[1].suggested, 4);
});
