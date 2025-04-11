import runpod
import subprocess
import json
import os

# Get the directory where the handler.py script is located
script_dir = os.path.dirname(os.path.realpath(__file__))
# Construct the absolute path to handler.js
node_script_path = os.path.join(script_dir, 'handler.js')

print(f"Python handler starting.")
print(f"Node script path: {node_script_path}")

def handler(job):
    """ 
    RunPod handler function that wraps the Node.js script.
    """
    print("Python handler received job:", json.dumps(job, indent=2))
    job_input = job.get('input', None)

    if job_input is None:
        return {"error": "No input provided in the job"}

    try:
        # Serialize the input data to pass as a command-line argument
        input_json_string = json.dumps(job_input)

        # Command to execute the Node.js script
        # Make sure Node.js is in the PATH within your Docker container
        command = ['node', node_script_path, input_json_string]
        
        print(f"Executing command: {' '.join(command)}")

        # Execute the Node.js script
        # Capture stdout and stderr, decode from bytes, timeout after 15 minutes (900 seconds)
        result = subprocess.run(
            command, 
            capture_output=True, 
            text=True, 
            check=True, # Raise an exception if Node.js script exits with non-zero code
            timeout=900 # Adjust timeout as needed
        )

        print(f"Node.js script stdout:\n{result.stdout}")
        if result.stderr:
            print(f"Node.js script stderr:\n{result.stderr}")

        # Try to parse the stdout from Node.js as JSON
        try:
            output_data = json.loads(result.stdout)
            return output_data
        except json.JSONDecodeError:
            print("Error: Node.js script did not return valid JSON.")
            # Return the raw stdout if it's not JSON, potentially useful for debugging
            return {"error": "Node.js script did not return valid JSON", "raw_output": result.stdout}

    except subprocess.CalledProcessError as e:
        print(f"Error executing Node.js script: {e}")
        print(f"Node.js stderr: {e.stderr}")
        return {"error": f"Node.js script failed with exit code {e.returncode}", "stderr": e.stderr}
    except subprocess.TimeoutExpired as e:
        print(f"Error: Node.js script timed out after {e.timeout} seconds.")
        return {"error": f"Node.js script timed out after {e.timeout} seconds"}
    except Exception as e:
        print(f"An unexpected error occurred in the Python handler: {e}")
        return {"error": f"Python handler error: {str(e)}"}

# Start the RunPod serverless worker
print("Starting RunPod serverless worker...")
runpod.serverless.start({"handler": handler})
