// Page object for the Items page (/items, public/items.html).
import type { Page, Locator } from "@playwright/test";

export class ItemsPage {
  readonly heading: Locator;
  readonly newItemInput: Locator;
  readonly addItemButton: Locator;
  readonly error: Locator;
  readonly emptyMessage: Locator;
  readonly list: Locator;
  readonly entries: Locator;

  constructor(readonly page: Page) {
    this.heading = page.getByRole("heading", { name: "Items", level: 1 });
    this.newItemInput = page.getByLabel("New item");
    this.addItemButton = page.getByRole("button", { name: "Add item" });
    this.error = page.getByTestId("item-error");
    this.emptyMessage = page.getByTestId("items-empty");
    this.list = page.getByTestId("items-list");
    this.entries = this.list.getByTestId("item");
  }

  async goto(): Promise<void> {
    await this.page.goto("/items");
  }

  entry(name: string): Locator {
    return this.entries.filter({ hasText: name });
  }
}
