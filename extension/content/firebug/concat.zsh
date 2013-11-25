#!/usr/bin/env zsh
setopt shwordsplit
rm main.concat.js
# List every js files
list_of_files=$(ls **/*.js)

for file in $list_of_files 
do
	# Get the name of the current file and remove the extension
	file_noext=$(echo $file | sed "s/\.js$//")
	# Check if there is a call to the define function
	grep -q "^define(" $file 
	# If there is, this is a module that we want to put in the concatenated script
	if [ $? -eq 0 ] 
	then
		echo "adding $file";
		# We change the call to define, so we provide add path of the current file as the first argument.
		# In other word (where moduleToDefine is the current file without extension): 
		#    - before: 
		#    		define([
		#    			"firebug/blah/fileToInclude", 
		#    			...
		#    		], function(){ 
		#    		<code of the module> 
		#    		});
		#    - after: 
		#    		define("path/of/moduleToDefine", 
		#    		[
		#    			"firebug/blah/fileToInclude", 
		#    			...
		#    		], 
		#    		function(){ 
		#    			<code of the module> 
		#    		});

		sed "s#^define(#&\"firebug/$file_noext\",\n#1" $file >> main.concat.js;
		
	fi
done

# We finally append main.js
echo "adding main.js";
cat main.js >> main.concat.js

# Proposition to adapt the inclusion of main.js to main.concat.js in firebugFrame.js 
echo -n "Do you want to modify ./firefox/firebugFrame.xul? [y/N] ";
read modifyFbFrame

if [ ${modifyFbFrame:l} = "y" ]
then
	sed -i "s/main.js/main.concat.js/g" ./firefox/firebugFrame.xul;
fi
