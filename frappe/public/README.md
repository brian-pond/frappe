## build.json
The JSON format does not support comments.  So adding my notes here.

### Improvements of 'noyarn'
The "noyarn" branch has improved on the original 'build.json' by adding an additional level of depth: concat and bundle.

```
**concat** (1st level)
    name of contact file (2nd level)
        files that will be concatenated together (3rd level)

**bundle** (1st level)
    name of bundle file (2nd level)
        files that will be bundled together (3rd level)
```

The code that handles this is JavaScript, and is located at: `../frappe-repo/rollup/build.js`

     
      
  

