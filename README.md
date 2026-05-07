# Better Edit
Core concept: only handles edits; keep all original system functionality and rendering, so the plugin keeps full compatibility natively and accross platforms

Extendability: for all features, we should also support other extensions if they also support **native first** philosophy

## Blocks Drag and Drop
- Key features
    - Notion like edit experience
    - Every content is a block. Hover on it reveals a + (add bellow or on top) and a handle (for drag and drop)
- Key consideration
    - What is a valid block?
    - Easy ones: 
        - Single line of text, check box, list item
        - The dividers
        - code block
        - Completed html block
        - Call out blocks
    - Challenges:
        - Uncompleted code block, html, etc
            - potential solution: treat them as text
        - Customized blocks, like 
            ```sp-bar
                my customized block
            ```
            - Just treat the source as the same as code block
        
## Text Styling
- Key features
    - Notion like edit experience
    - Select
- Challanges
    - The native UI reveals source of the text style part when it's selected
    - Boolean logic, for example for `**my bold text**`, if the user somehow select only `**my bold`, and choose ; or if the use select text containing none formated and formated text, what will happen?
    - Hopefully this plug in handles that gracefully, for all the cases

## Slash Commnad
- A simply slash command feature to help put in a new block, like list, checkbox, etc.
- Potentially allow the user to register their own command, so we can support other extensions

## Image Arrangement
- One important feature described in @./DESIGN.md